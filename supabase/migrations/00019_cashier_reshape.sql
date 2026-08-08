-- =====================================================================
-- BOLOS ALLEY OS — Migration 00019
-- Cashier reshape: shifts become one-per-store-day (not one-per-cashier),
-- and a cart's wallet tender line can name a payer other than the cart's
-- own customer (pay from a friend's wallet).
-- =====================================================================

-- ---------------------------------------------------------------------
-- SHIFTS: one per store-day per branch, not one per cashier.
-- ---------------------------------------------------------------------
alter table public.cashier_shifts
  add column if not exists store_date date;

-- One-time backfill for existing rows only — going forward, app code
-- computes store_date correctly via the venue-day math in src/lib/slots.ts
-- (branch opens_at/closes_at + tenant timezone, handles midnight-crossing).
-- This backfill is a plain calendar-date approximation, adequate only for
-- historical rows created under the old per-cashier model.
update public.cashier_shifts
set store_date = (opened_at at time zone 'Asia/Riyadh')::date
where store_date is null;

alter table public.cashier_shifts
  alter column store_date set not null;

drop index if exists idx_cashier_shifts_one_open_per_cashier;

alter table public.cashier_shifts drop constraint if exists uq_cashier_shifts_branch_store_date;
alter table public.cashier_shifts
  add constraint uq_cashier_shifts_branch_store_date unique (branch_id, store_date);

-- ---------------------------------------------------------------------
-- CART PAYMENTS: a wallet line can name a payer other than the cart's own
-- customer ("pay from a friend's wallet"). Null means the cart's own
-- customer paid — the common case.
-- ---------------------------------------------------------------------
alter table public.cart_payments
  add column if not exists payer_customer_id uuid references public.profiles(id);
