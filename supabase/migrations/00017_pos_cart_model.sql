-- =====================================================================
-- BOLOS ALLEY OS — Migration 00017
-- Unify tabs into a single cart/tab order model + quantity/discount/card-ref
-- columns for upcoming POS prompts (cart-level discounts, product lines).
--
-- 00016 already shipped tabs/tab_items/tab_payments, tested and carrying
-- live settled data + a linked invoice. This migration RENAMES that schema
-- to carts/cart_items/cart_payments (Postgres preserves data, indexes, FKs,
-- and RLS policies across a rename — dependent objects are automatically
-- re-pointed by OID, not by name) rather than dropping and recreating.
-- =====================================================================

alter table public.tabs rename to carts;
alter table public.tab_items rename to cart_items;
alter table public.tab_payments rename to cart_payments;

alter table public.cart_items rename column tab_id to cart_id;
alter table public.cart_payments rename column tab_id to cart_id;

alter index if exists idx_tabs_branch_status rename to idx_carts_branch_status;
alter index if exists idx_tabs_customer rename to idx_carts_customer;
alter index if exists idx_tab_items_tab rename to idx_cart_items_cart;
alter index if exists idx_tab_payments_tab rename to idx_cart_payments_cart;

alter policy "tabs_staff_branch" on public.carts rename to "carts_staff_branch";
alter policy "tab_items_staff_branch" on public.cart_items rename to "cart_items_staff_branch";
alter policy "tab_payments_staff_branch" on public.cart_payments rename to "cart_payments_staff_branch";

-- ---------------------------------------------------------------------
-- New columns for cart-level and line-level discounting (populated by a
-- later prompt; present now so the schema doesn't need to change again).
-- ---------------------------------------------------------------------
alter table public.carts
  rename column total_cents to subtotal_cents;
alter table public.carts
  add column if not exists discount_cents bigint not null default 0;
alter table public.carts
  add column if not exists total_cents bigint not null default 0;
update public.carts set total_cents = subtotal_cents where total_cents = 0;

alter table public.cart_items
  rename column amount_cents to unit_price_cents;
alter table public.cart_items
  add column if not exists quantity int not null default 1;
alter table public.cart_items
  add column if not exists line_discount_cents bigint not null default 0;
alter table public.cart_items
  add column if not exists amount_cents bigint not null default 0;
update public.cart_items set amount_cents = unit_price_cents * quantity where amount_cents = 0;

alter table public.cart_payments
  add column if not exists card_reference text;

-- ---------------------------------------------------------------------
-- invoices.source_tab_id -> source_cart_id (rename for consistency)
-- ---------------------------------------------------------------------
alter table public.invoices rename column source_tab_id to source_cart_id;
alter index if exists idx_invoices_tab rename to idx_invoices_cart;

-- issue_invoice's last parameter is renamed p_source_tab_id -> p_source_cart_id.
-- Postgres does not allow renaming an existing parameter via CREATE OR
-- REPLACE (only appending new ones), so the old signature is dropped first.
drop function if exists public.issue_invoice(
  uuid, uuid, public.invoice_type, text, text, text, text, text,
  bigint, numeric, bigint, bigint, jsonb, text, uuid, uuid, uuid, uuid, uuid
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
  p_source_cart_id uuid default null
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
    issued_by, source_payment_id, source_session_id, corrects_invoice_id, source_cart_id
  ) values (
    p_tenant_id, p_branch_id, v_num, p_invoice_type,
    p_seller_name, p_seller_vat_number, p_seller_address,
    p_buyer_name, p_buyer_vat_number,
    p_subtotal_cents, p_vat_rate, p_vat_amount_cents, p_total_cents,
    p_line_items, p_qr_tlv_base64,
    p_issued_by, p_source_payment_id, p_source_session_id, p_corrects_invoice_id, p_source_cart_id
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
