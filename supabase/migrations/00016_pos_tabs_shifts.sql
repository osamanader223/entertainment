-- =====================================================================
-- BOLOS ALLEY OS — Migration 00016
-- Cashier POS: shifts (cash reconciliation), running tabs, split payments
-- =====================================================================

-- 'card' didn't exist as a tender at the cashier before (only cash/wallet) —
-- tab settlement introduces it as a split-payment method.
alter type public.payment_method add value if not exists 'card';

-- ---------------------------------------------------------------------
-- SHIFTS
-- ---------------------------------------------------------------------
create table if not exists public.cashier_shifts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  cashier_id uuid not null references auth.users(id),
  opened_at timestamptz not null default now(),
  opening_float_cents bigint not null default 0,
  closed_at timestamptz,
  expected_cash_cents bigint,
  expected_card_cents bigint,
  expected_wallet_cents bigint,
  counted_cash_cents bigint,
  variance_cents bigint,
  close_note text,
  status text not null default 'open' check (status in ('open','closed'))
);

-- Only one open shift per cashier per branch at a time.
create unique index if not exists idx_cashier_shifts_one_open_per_cashier
  on public.cashier_shifts(branch_id, cashier_id)
  where (status = 'open');

create index if not exists idx_cashier_shifts_branch on public.cashier_shifts(branch_id, opened_at desc);

-- Every captured payment now optionally belongs to the cashier shift it was
-- taken under, so shift reconciliation can sum "what came in on my watch" by
-- method without joining through sessions/tabs.
alter table public.payments
  add column if not exists shift_id uuid references public.cashier_shifts(id) on delete set null;

create index if not exists idx_payments_shift on public.payments(shift_id);

-- ---------------------------------------------------------------------
-- TABS
-- ---------------------------------------------------------------------
create table if not exists public.tabs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  shift_id uuid references public.cashier_shifts(id),
  customer_id uuid references public.profiles(id),
  label text,
  opened_by uuid not null references auth.users(id),
  opened_at timestamptz not null default now(),
  status text not null default 'open' check (status in ('open','settled','void')),
  settled_at timestamptz,
  total_cents bigint not null default 0
);

create index if not exists idx_tabs_branch_status on public.tabs(branch_id, status);
create index if not exists idx_tabs_customer on public.tabs(customer_id);

-- ---------------------------------------------------------------------
-- TAB LINE ITEMS
-- ---------------------------------------------------------------------
create table if not exists public.tab_items (
  id uuid primary key default gen_random_uuid(),
  tab_id uuid not null references public.tabs(id) on delete cascade,
  description text not null,
  session_id uuid references public.sessions(id),
  amount_cents bigint not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_tab_items_tab on public.tab_items(tab_id);

-- ---------------------------------------------------------------------
-- SPLIT PAYMENTS (settlement lines)
-- ---------------------------------------------------------------------
create table if not exists public.tab_payments (
  id uuid primary key default gen_random_uuid(),
  tab_id uuid not null references public.tabs(id) on delete cascade,
  method text not null check (method in ('cash','card','wallet')),
  amount_cents bigint not null,
  payment_id uuid references public.payments(id),
  created_at timestamptz not null default now()
);

create index if not exists idx_tab_payments_tab on public.tab_payments(tab_id);

-- Invoices issued at tab settlement cover the WHOLE tab, not a single
-- payment row (a split settlement can produce several payments rows, one
-- per tender) — so the invoice traces back to the tab instead.
alter table public.invoices
  add column if not exists source_tab_id uuid references public.tabs(id);

create index if not exists idx_invoices_tab on public.invoices(source_tab_id);

-- issue_invoice must be able to set source_tab_id AT INSERT TIME — invoices
-- are immutable (see 00015's no_update_invoices trigger), so there is no
-- follow-up UPDATE available once the row exists. Dropped and recreated
-- (rather than a plain create-or-replace) because adding a parameter
-- changes the function's signature.
drop function if exists public.issue_invoice(
  uuid, uuid, public.invoice_type, text, text, text, text, text,
  bigint, numeric, bigint, bigint, jsonb, text, uuid, uuid, uuid, uuid
);

create or replace function public.issue_invoice(
  p_tenant_id uuid,
  p_branch_id uuid,
  p_invoice_type public.invoice_type,
  p_seller_name text,
  p_seller_vat_number text,
  p_seller_address text,
  p_buyer_name text,
  p_buyer_vat_number text,
  p_subtotal_cents bigint,
  p_vat_rate numeric,
  p_vat_amount_cents bigint,
  p_total_cents bigint,
  p_line_items jsonb,
  p_qr_tlv_base64 text,
  p_issued_by uuid,
  p_source_payment_id uuid,
  p_source_session_id uuid,
  p_corrects_invoice_id uuid,
  p_source_tab_id uuid default null
)
returns public.invoices
language plpgsql
security definer
set search_path = public
as $$
declare
  v_num bigint;
  v_row public.invoices;
begin
  insert into public.invoice_sequences (branch_id, next_number)
  values (p_branch_id, 1)
  on conflict (branch_id) do nothing;

  update public.invoice_sequences
  set next_number = next_number + 1
  where branch_id = p_branch_id
  returning next_number - 1 into v_num;

  insert into public.invoices (
    tenant_id, branch_id, invoice_number, invoice_type,
    seller_name, seller_vat_number, seller_address,
    buyer_name, buyer_vat_number,
    subtotal_cents, vat_rate, vat_amount_cents, total_cents,
    line_items, qr_tlv_base64,
    issued_by, source_payment_id, source_session_id, corrects_invoice_id, source_tab_id
  ) values (
    p_tenant_id, p_branch_id, v_num, p_invoice_type,
    p_seller_name, p_seller_vat_number, p_seller_address,
    p_buyer_name, p_buyer_vat_number,
    p_subtotal_cents, p_vat_rate, p_vat_amount_cents, p_total_cents,
    p_line_items, p_qr_tlv_base64,
    p_issued_by, p_source_payment_id, p_source_session_id, p_corrects_invoice_id, p_source_tab_id
  )
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.issue_invoice(
  uuid, uuid, public.invoice_type, text, text, text, text, text,
  bigint, numeric, bigint, bigint, jsonb, text, uuid, uuid, uuid, uuid, uuid
) from public, anon, authenticated;

grant execute on function public.issue_invoice(
  uuid, uuid, public.invoice_type, text, text, text, text, text,
  bigint, numeric, bigint, bigint, jsonb, text, uuid, uuid, uuid, uuid, uuid
) to service_role;

-- ---------------------------------------------------------------------
-- RLS — same shape as sessions/queue_tickets: staff of the branch can
-- read/write; nothing here is customer-visible.
-- ---------------------------------------------------------------------
alter table public.cashier_shifts enable row level security;
alter table public.tabs enable row level security;
alter table public.tab_items enable row level security;
alter table public.tab_payments enable row level security;

create policy "cashier_shifts_staff_branch" on public.cashier_shifts
  for all using (public.has_branch_access(branch_id))
  with check (public.has_branch_access(branch_id));

create policy "tabs_staff_branch" on public.tabs
  for all using (public.has_branch_access(branch_id))
  with check (public.has_branch_access(branch_id));

create policy "tab_items_staff_branch" on public.tab_items
  for all using (
    exists (select 1 from public.tabs t where t.id = tab_items.tab_id and public.has_branch_access(t.branch_id))
  )
  with check (
    exists (select 1 from public.tabs t where t.id = tab_items.tab_id and public.has_branch_access(t.branch_id))
  );

create policy "tab_payments_staff_branch" on public.tab_payments
  for all using (
    exists (select 1 from public.tabs t where t.id = tab_payments.tab_id and public.has_branch_access(t.branch_id))
  )
  with check (
    exists (select 1 from public.tabs t where t.id = tab_payments.tab_id and public.has_branch_access(t.branch_id))
  );
