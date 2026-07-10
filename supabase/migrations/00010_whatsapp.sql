-- =====================================================================
-- BOLOS ALLEY OS — Migration 00010
-- Transactional WhatsApp messaging: service-window tracking, opt-out,
-- and idempotency/cost-tracking fields on notifications.
-- Run this in Supabase SQL editor before testing WhatsApp notifications.
-- =====================================================================

-- Track the 24-hour customer service window per customer (free messaging window)
alter table public.profiles
  add column if not exists whatsapp_window_expires_at timestamptz,   -- set to now()+24h whenever the customer sends us a message
  add column if not exists whatsapp_opted_out boolean not null default false;  -- customer said STOP

-- Notifications: add fields for idempotency + cost tracking
alter table public.notifications
  add column if not exists reference_type text,
  add column if not exists reference_id uuid,
  add column if not exists category text check (category in ('utility','marketing','service','authentication')),
  add column if not exists was_free boolean not null default false,   -- true if sent inside the service window
  add column if not exists estimated_cost_cents int not null default 0;

-- Idempotency: one notification per (template, reference) per customer
create unique index if not exists uq_notifications_idempotent
  on public.notifications(tenant_id, customer_id, template_code, reference_type, reference_id)
  where reference_type is not null and reference_id is not null;

create index if not exists idx_notifications_queued on public.notifications(status, send_after)
  where status = 'queued';
