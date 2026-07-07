-- =====================================================================
-- BOLOS ALLEY OS — Migration 00009
-- Customer CRM: private staff notes on a customer profile.
-- Run this in Supabase SQL editor before testing the /admin/customers area.
-- =====================================================================

create table if not exists public.customer_notes (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  customer_id uuid not null references public.profiles(id) on delete cascade,
  author_id uuid references public.profiles(id) on delete set null,
  note text not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_customer_notes_customer on public.customer_notes(tenant_id, customer_id, created_at desc);

alter table public.customer_notes enable row level security;

create policy "customer_notes_tenant_read" on public.customer_notes
  for select using (public.is_tenant_member(tenant_id));

create policy "customer_notes_tenant_write" on public.customer_notes
  for insert with check (public.is_tenant_member(tenant_id));

create policy "customer_notes_tenant_delete" on public.customer_notes
  for delete using (public.is_tenant_manager(tenant_id));
