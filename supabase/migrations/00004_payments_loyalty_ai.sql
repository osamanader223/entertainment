-- =====================================================================
-- BOLOS ALLEY OS — Migration 00004
-- Payments, loyalty, rewards, AI behavior, notifications, activity log
-- =====================================================================

create type public.payment_provider as enum ('moyasar','hyperpay','cash','manual');
create type public.payment_method   as enum ('mada','visa','mastercard','apple_pay','stc_pay','cash','wallet');
create type public.payment_status   as enum ('initiated','pending','captured','failed','refunded','partially_refunded','cancelled');
create type public.payment_purpose  as enum ('deposit','session','extension','top_up','reward_purchase','other');

create type public.loyalty_tier as enum ('silver','gold','platinum','vip');

create type public.notification_channel as enum ('whatsapp','sms','email','push','in_app');
create type public.notification_status  as enum ('queued','sent','delivered','read','failed');

-- ---------------------------------------------------------------------
-- Payments ledger (Moyasar-first; provider-agnostic)
-- ---------------------------------------------------------------------
create table public.payments (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  branch_id uuid references public.branches(id) on delete set null,
  customer_id uuid references public.profiles(id) on delete set null,
  -- What is being paid for
  purpose public.payment_purpose not null,
  booking_id uuid references public.bookings(id) on delete set null,
  session_id uuid references public.sessions(id) on delete set null,
  -- Money
  amount_cents bigint not null check (amount_cents >= 0),
  currency text not null default 'SAR',
  -- Provider
  provider public.payment_provider not null,
  method public.payment_method,
  status public.payment_status not null default 'initiated',
  -- Moyasar payload
  provider_payment_id text,                  -- moyasar payment id
  provider_invoice_id text,
  provider_raw jsonb,                        -- store full callback for audit
  -- Refunds
  refunded_amount_cents bigint not null default 0,
  -- Audit
  initiated_by uuid references public.profiles(id),
  captured_at timestamptz,
  failed_at timestamptz,
  failure_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_payments_tenant on public.payments(tenant_id);
create index idx_payments_customer on public.payments(customer_id);
create index idx_payments_booking on public.payments(booking_id);
create index idx_payments_session on public.payments(session_id);
create index idx_payments_status on public.payments(tenant_id, status);
create index idx_payments_provider_id on public.payments(provider_payment_id);
create index idx_payments_created on public.payments(created_at desc);

-- ---------------------------------------------------------------------
-- Loyalty accounts (per customer per tenant)
-- ---------------------------------------------------------------------
create table public.loyalty_accounts (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  customer_id uuid not null references public.profiles(id) on delete cascade,
  -- Balances
  points_balance int not null default 0,
  lifetime_points_earned int not null default 0,
  lifetime_points_redeemed int not null default 0,
  -- Gamification
  tier public.loyalty_tier not null default 'silver',
  current_streak_days int not null default 0,
  longest_streak_days int not null default 0,
  last_visit_date date,
  -- Referrals
  referral_code text unique,
  referred_by_customer_id uuid references public.profiles(id),
  -- Lifecycle
  enrolled_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, customer_id)
);

create index idx_loyalty_tenant on public.loyalty_accounts(tenant_id);
create index idx_loyalty_customer on public.loyalty_accounts(customer_id);
create index idx_loyalty_tier on public.loyalty_accounts(tenant_id, tier);

-- ---------------------------------------------------------------------
-- Loyalty ledger (full audit trail)
-- ---------------------------------------------------------------------
create table public.loyalty_ledger (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  account_id uuid not null references public.loyalty_accounts(id) on delete cascade,
  delta_points int not null,                 -- positive earn, negative redeem
  reason text not null,                      -- "session_completed", "referral", "redeem_reward"
  reference_type text,                       -- "session" | "booking" | "reward" | "manual"
  reference_id uuid,
  metadata jsonb,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id)
);

create index idx_ledger_account on public.loyalty_ledger(account_id, created_at desc);
create index idx_ledger_tenant on public.loyalty_ledger(tenant_id);

-- ---------------------------------------------------------------------
-- Badges & badge awards
-- ---------------------------------------------------------------------
create table public.badges (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  code text not null,
  name_ar text not null,
  name_en text not null,
  description text,
  icon text,
  criteria jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (tenant_id, code)
);

create table public.badge_awards (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  customer_id uuid not null references public.profiles(id) on delete cascade,
  badge_id uuid not null references public.badges(id) on delete cascade,
  awarded_at timestamptz not null default now(),
  unique (customer_id, badge_id)
);

-- ---------------------------------------------------------------------
-- Rewards catalog & redemptions
-- ---------------------------------------------------------------------
create table public.rewards (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name_ar text not null,
  name_en text not null,
  description text,
  cost_points int not null check (cost_points > 0),
  min_tier public.loyalty_tier not null default 'silver',
  stock int,                                 -- null = unlimited
  is_active boolean not null default true,
  valid_from timestamptz,
  valid_to timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.reward_redemptions (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  customer_id uuid not null references public.profiles(id) on delete cascade,
  reward_id uuid not null references public.rewards(id) on delete restrict,
  cost_points int not null,
  status text not null default 'issued',     -- issued | used | expired | cancelled
  redemption_code text unique not null default upper(substring(replace(uuid_generate_v4()::text,'-',''),1,10)),
  redeemed_at timestamptz not null default now(),
  used_at timestamptz
);

create index idx_redemptions_customer on public.reward_redemptions(customer_id);
create index idx_redemptions_tenant on public.reward_redemptions(tenant_id);

-- ---------------------------------------------------------------------
-- Marketing offers / campaigns
-- ---------------------------------------------------------------------
create table public.offers (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  code text not null,
  name text not null,
  description text,
  discount_type text not null check (discount_type in ('percent','fixed','free_minutes','double_points')),
  discount_value int not null,
  applies_to_game_type_id uuid references public.game_types(id) on delete cascade,
  min_amount_cents bigint,
  max_uses int,
  uses_count int not null default 0,
  valid_from timestamptz,
  valid_to timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (tenant_id, code)
);

-- ---------------------------------------------------------------------
-- AI behavior tracking (events stream)
-- ---------------------------------------------------------------------
create table public.behavior_events (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  branch_id uuid references public.branches(id) on delete set null,
  customer_id uuid references public.profiles(id) on delete cascade,
  event_type text not null,                  -- "session_started", "session_extended", "booking_cancelled", etc.
  game_type_id uuid references public.game_types(id) on delete set null,
  session_id uuid references public.sessions(id) on delete set null,
  metadata jsonb,
  occurred_at timestamptz not null default now()
);

create index idx_behavior_customer on public.behavior_events(customer_id, occurred_at desc);
create index idx_behavior_tenant on public.behavior_events(tenant_id, occurred_at desc);
create index idx_behavior_type on public.behavior_events(tenant_id, event_type);

-- ---------------------------------------------------------------------
-- AI customer profile (derived insights, refreshed by edge fn)
-- ---------------------------------------------------------------------
create table public.customer_insights (
  customer_id uuid primary key references public.profiles(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  favorite_game_type_id uuid references public.game_types(id),
  preferred_day_of_week int,                 -- 0-6
  preferred_hour int,                        -- 0-23
  avg_session_minutes numeric,
  avg_spend_cents bigint,
  visit_count int not null default 0,
  last_visit_at timestamptz,
  churn_risk_score numeric,                  -- 0..1
  ltv_cents bigint,
  next_visit_predicted_at timestamptz,
  updated_at timestamptz not null default now()
);

create index idx_insights_tenant on public.customer_insights(tenant_id);
create index idx_insights_churn on public.customer_insights(tenant_id, churn_risk_score desc);

-- ---------------------------------------------------------------------
-- Notifications outbox (WhatsApp, SMS, etc.)
-- ---------------------------------------------------------------------
create table public.notifications (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  customer_id uuid references public.profiles(id) on delete set null,
  channel public.notification_channel not null,
  template_code text,                        -- "booking_confirmed", "session_ending_soon"
  payload jsonb not null,                    -- template variables
  rendered_body text,
  status public.notification_status not null default 'queued',
  provider_message_id text,
  send_after timestamptz not null default now(),
  sent_at timestamptz,
  delivered_at timestamptz,
  read_at timestamptz,
  error text,
  retries int not null default 0,
  created_at timestamptz not null default now()
);

create index idx_notifications_status on public.notifications(status, send_after);
create index idx_notifications_customer on public.notifications(customer_id);
create index idx_notifications_tenant on public.notifications(tenant_id);

-- ---------------------------------------------------------------------
-- Activity log (your PDF: "Recently — last 50 actions, tamper-proof")
-- ---------------------------------------------------------------------
create table public.activity_log (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  branch_id uuid references public.branches(id) on delete set null,
  actor_id uuid references public.profiles(id) on delete set null,
  actor_role public.app_role,
  action text not null,                      -- "session.started", "session.reset", "master.reset"
  entity_type text,
  entity_id uuid,
  before jsonb,
  after jsonb,
  ip_address inet,
  user_agent text,
  occurred_at timestamptz not null default now()
);

-- Append-only enforcement (tamper-evident; matches your PDF claim)
create index idx_activity_tenant on public.activity_log(tenant_id, occurred_at desc);
create index idx_activity_branch on public.activity_log(branch_id, occurred_at desc);
create index idx_activity_action on public.activity_log(tenant_id, action);

revoke update, delete on public.activity_log from public;

-- updated_at triggers where applicable
create trigger trg_payments_touch before update on public.payments
  for each row execute function public.touch_updated_at();
create trigger trg_loyalty_touch before update on public.loyalty_accounts
  for each row execute function public.touch_updated_at();
create trigger trg_rewards_touch before update on public.rewards
  for each row execute function public.touch_updated_at();
