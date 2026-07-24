-- =====================================================================
-- ZATCA Phase 1 (Generation Phase) e-invoicing.
--
-- PHASE 1 ONLY — no digital signatures, no ZATCA cryptographic stamp, no
-- certificates, no Fatoora API integration, no invoice hash chain. Just:
-- compliant tax invoices, a 5-tag TLV QR, gap-free sequential numbering,
-- and immutable storage.
-- =====================================================================

-- ---------------------------------------------------------------------
-- PART 0 — Seller (branch) tax details
-- ---------------------------------------------------------------------
alter table public.branches
  add column if not exists vat_number text,
  add column if not exists legal_name_ar text,
  add column if not exists legal_name_en text,
  add column if not exists address_street text,
  add column if not exists address_district text,
  add column if not exists address_city text,
  add column if not exists address_postal_code text,
  add column if not exists address_building_no text,
  add column if not exists cr_number text;

-- ZATCA VAT registration numbers are always 15 digits, starting and ending
-- with '3' (the tax-type digit for VAT in the GCC TIN scheme).
alter table public.branches drop constraint if exists branches_vat_number_format;
alter table public.branches
  add constraint branches_vat_number_format
  check (vat_number is null or vat_number ~ '^3[0-9]{13}3$');

-- ---------------------------------------------------------------------
-- PART 1 — Invoice schema (immutable, one gap-free sequence per branch)
-- ---------------------------------------------------------------------

-- A dedicated counter table enforces the gap-free sequence — locked and
-- incremented atomically by issue_invoice() below, never touched directly.
create table if not exists public.invoice_sequences (
  branch_id uuid primary key references public.branches(id) on delete cascade,
  next_number bigint not null default 1
);

do $$ begin
  create type public.invoice_type as enum ('standard', 'simplified', 'credit_note', 'debit_note');
exception
  when duplicate_object then null;
end $$;

create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  invoice_number bigint not null,
  invoice_type public.invoice_type not null default 'simplified',
  -- Seller snapshot — frozen at issue time. Never re-read from branches
  -- live, so a later change to the branch's VAT details can't silently
  -- rewrite the seller block on a historical invoice.
  seller_name text not null,
  seller_vat_number text not null,
  seller_address text,
  -- Buyer — null/optional for a simplified B2C invoice; both required in
  -- practice for a standard B2B invoice (enforced in application code, not
  -- a DB constraint, since which invoice_type requires what isn't a fixed
  -- per-column rule ZATCA expresses as a simple CHECK).
  buyer_name text,
  buyer_vat_number text,
  -- Amounts, integer halalas throughout.
  subtotal_cents bigint not null,
  vat_rate numeric(5,2) not null default 15.00,
  vat_amount_cents bigint not null,
  total_cents bigint not null,
  -- Line items snapshot: [{description_ar, description_en, qty, unit_price_cents, vat_cents, total_cents}]
  line_items jsonb not null,
  -- ZATCA Phase 1 QR (5-tag TLV, Base64) — see src/lib/zatca/qr.ts
  qr_tlv_base64 text not null,
  issued_at timestamptz not null default now(),
  issued_by uuid references auth.users(id),
  source_payment_id uuid references public.payments(id),
  source_session_id uuid references public.sessions(id),
  -- Corrections are NEW rows (credit/debit notes) that point back at the
  -- original — the original is never edited or deleted.
  corrects_invoice_id uuid references public.invoices(id),
  unique (branch_id, invoice_number)
);

create index if not exists idx_invoices_tenant on public.invoices(tenant_id, issued_at desc);
create index if not exists idx_invoices_branch_number on public.invoices(branch_id, invoice_number);
create index if not exists idx_invoices_payment on public.invoices(source_payment_id);
create index if not exists idx_invoices_corrects on public.invoices(corrects_invoice_id);

-- IMMUTABILITY — block UPDATE and DELETE at the database level. This is a
-- hard ZATCA Phase 1 requirement (tamper-proof storage), not just an
-- application-level convention: even a service-role query cannot bypass
-- these triggers (BEFORE triggers fire regardless of role).
create or replace function public.prevent_invoice_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'Invoices are immutable and cannot be % (ZATCA Phase 1 compliance)', tg_op;
end;
$$;

drop trigger if exists no_update_invoices on public.invoices;
create trigger no_update_invoices before update on public.invoices
  for each row execute function public.prevent_invoice_mutation();

drop trigger if exists no_delete_invoices on public.invoices;
create trigger no_delete_invoices before delete on public.invoices
  for each row execute function public.prevent_invoice_mutation();

alter table public.invoices enable row level security;
alter table public.invoice_sequences enable row level security;

-- Staff+ of the tenant can read invoices. There is deliberately no
-- insert/update/delete policy on invoices at all for regular roles — the
-- only write path is the SECURITY DEFINER issue_invoice() function below,
-- which bypasses RLS under its owner's privileges. A plain client-side
-- insert is rejected outright (no policy grants it), and update/delete are
-- additionally blocked by the triggers above even for the service role.
create policy "invoices_staff_read" on public.invoices
  for select using (public.is_tenant_member(tenant_id));

-- invoice_sequences is a pure internal counter — no policies at all, so no
-- role can read or write it directly; only issue_invoice()'s SECURITY
-- DEFINER privileges touch it.

-- ---------------------------------------------------------------------
-- PART 2 — Atomic, gap-free invoice issuance
--
-- The UPDATE below takes a row-level lock on the branch's counter row, so
-- concurrent calls for the same branch serialize: no two invoices can ever
-- receive the same number, and the whole function body runs in the
-- caller's transaction, so if the INSERT into invoices fails for any
-- reason, the counter increment is rolled back too — no gaps, ever.
-- ---------------------------------------------------------------------
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
  p_corrects_invoice_id uuid
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
    issued_by, source_payment_id, source_session_id, corrects_invoice_id
  ) values (
    p_tenant_id, p_branch_id, v_num, p_invoice_type,
    p_seller_name, p_seller_vat_number, p_seller_address,
    p_buyer_name, p_buyer_vat_number,
    p_subtotal_cents, p_vat_rate, p_vat_amount_cents, p_total_cents,
    p_line_items, p_qr_tlv_base64,
    p_issued_by, p_source_payment_id, p_source_session_id, p_corrects_invoice_id
  )
  returning * into v_row;

  return v_row;
end;
$$;

-- service_role only — this is a write-capable SECURITY DEFINER function
-- (unlike the read-only boolean helpers elsewhere in this schema that are
-- fine to leave anon/authenticated-executable), and it's only ever called
-- from trusted server-side code (src/lib/invoices.ts via
-- createAdminClient()), never from a client session. Postgres grants
-- EXECUTE to PUBLIC by default, so this must be explicit.
revoke all on function public.issue_invoice(
  uuid, uuid, public.invoice_type, text, text, text, text, text,
  bigint, numeric, bigint, bigint, jsonb, text, uuid, uuid, uuid, uuid
) from public, anon, authenticated;

grant execute on function public.issue_invoice(
  uuid, uuid, public.invoice_type, text, text, text, text, text,
  bigint, numeric, bigint, bigint, jsonb, text, uuid, uuid, uuid, uuid
) to service_role;
