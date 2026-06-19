-- =====================================================================
-- BOLOS ALLEY OS — Migration 00007
-- Offers admin: redemption type, per-customer limits, offer_redemptions
-- Run this in Supabase SQL editor before testing the admin area.
-- =====================================================================

alter table public.offers
  add column if not exists redemption_type text not null default 'code'
    check (redemption_type in ('code','auto')),
  add column if not exists max_uses_per_customer int,
  add column if not exists description_ar text,
  add column if not exists description_en text,
  add column if not exists min_tier text;

create table if not exists public.offer_redemptions (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  offer_id uuid not null references public.offers(id) on delete cascade,
  customer_id uuid references public.profiles(id) on delete set null,
  booking_id uuid references public.bookings(id) on delete set null,
  session_id uuid references public.sessions(id) on delete set null,
  discount_applied_cents bigint not null default 0,
  redeemed_at timestamptz not null default now()
);

create index if not exists idx_offer_redemptions_offer on public.offer_redemptions(offer_id);
create index if not exists idx_offer_redemptions_customer on public.offer_redemptions(customer_id);

alter table public.offer_redemptions enable row level security;

create policy "offer_redemptions_tenant_read" on public.offer_redemptions
  for select using (public.is_tenant_member(tenant_id));

create policy "offer_redemptions_self_read" on public.offer_redemptions
  for select using (customer_id = auth.uid());

create policy "offer_redemptions_tenant_write" on public.offer_redemptions
  for insert with check (public.is_tenant_member(tenant_id));
