-- =====================================================================
-- BOLOS ALLEY OS — Migration 00006
-- Wallets, queue prepayment, public anonymized live state
-- =====================================================================

-- ---------------------------------------------------------------------
-- Enum additions
-- ---------------------------------------------------------------------
alter type public.payment_status add value if not exists 'authorized' before 'captured';
alter type public.payment_purpose add value if not exists 'queue_hold';
alter type public.payment_purpose add value if not exists 'wallet_topup';

-- ---------------------------------------------------------------------
-- Wallets: one per customer per tenant
-- Source of truth for store-credit balances.
-- ---------------------------------------------------------------------
create table public.wallets (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  customer_id uuid not null references public.profiles(id) on delete cascade,
  balance_cents bigint not null default 0 check (balance_cents >= 0),
  currency text not null default 'SAR',
  -- Lifetime totals
  lifetime_credited_cents bigint not null default 0,
  lifetime_debited_cents bigint not null default 0,
  -- Soft freeze (e.g. fraud hold)
  is_frozen boolean not null default false,
  frozen_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, customer_id)
);

create index idx_wallets_customer on public.wallets(customer_id);
create index idx_wallets_tenant on public.wallets(tenant_id);

create trigger trg_wallets_touch before update on public.wallets
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- Wallet ledger: every credit/debit, immutable
-- ---------------------------------------------------------------------
create type public.wallet_entry_kind as enum (
  'credit_cancellation',  -- refund from cancelled queue/booking
  'credit_topup',          -- customer top-up
  'credit_offer',          -- marketing / win-back credit
  'credit_referral',
  'credit_admin',          -- manual grant by staff
  'debit_booking',         -- spent on a booking
  'debit_queue',           -- spent on queue join
  'debit_purchase',        -- spent on reward / merch
  'debit_admin'            -- manual deduction by staff
);

create table public.wallet_ledger (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  wallet_id uuid not null references public.wallets(id) on delete cascade,
  kind public.wallet_entry_kind not null,
  delta_cents bigint not null,            -- positive = credit, negative = debit
  balance_after_cents bigint not null,    -- snapshot for audit
  reason text,
  reference_type text,                    -- 'booking' | 'queue_ticket' | 'payment' | 'manual'
  reference_id uuid,
  metadata jsonb,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create index idx_wallet_ledger_wallet on public.wallet_ledger(wallet_id, created_at desc);
create index idx_wallet_ledger_tenant on public.wallet_ledger(tenant_id, created_at desc);
create index idx_wallet_ledger_ref on public.wallet_ledger(reference_type, reference_id);

-- Append-only enforcement
revoke update, delete on public.wallet_ledger from public;

-- ---------------------------------------------------------------------
-- queue_tickets: add prepayment + notification fields
-- ---------------------------------------------------------------------
alter table public.queue_tickets
  add column if not exists held_payment_id uuid references public.payments(id) on delete set null,
  add column if not exists paid_amount_cents bigint not null default 0,
  add column if not exists paid_from text check (paid_from in ('card','cash','wallet','mixed') or paid_from is null),
  add column if not exists notification_expires_at timestamptz,
  add column if not exists wallet_credit_ledger_id uuid references public.wallet_ledger(id);

-- ---------------------------------------------------------------------
-- bookings: add wallet payment tracking
-- ---------------------------------------------------------------------
alter table public.bookings
  add column if not exists wallet_paid_cents bigint not null default 0,
  add column if not exists held_payment_id uuid references public.payments(id) on delete set null;

-- ---------------------------------------------------------------------
-- profiles: walk-in tracking + lookup consent
-- ---------------------------------------------------------------------
alter table public.profiles
  add column if not exists walk_in_created boolean not null default false,
  add column if not exists phone_lookup_consent boolean not null default true,
  add column if not exists claimed_at timestamptz;

-- ---------------------------------------------------------------------
-- branches: queue policy (per-venue tuning)
-- ---------------------------------------------------------------------
alter table public.branches
  add column if not exists queue_policy jsonb not null default jsonb_build_object(
    'notification_window_minutes', 10,    -- how long they have to show up after being called
    'max_wait_minutes', 90,                -- if wait exceeds this, offer cash refund
    'allow_anonymous_queue', false,        -- enforce phone-linked queue tickets
    'cancellation_credit_percent', 100     -- % of payment converted to store credit on cancel
  );

-- ---------------------------------------------------------------------
-- PUBLIC LIVE STATE FUNCTION
-- Anyone can call this. Returns ONLY anonymized, aggregated data.
-- No names, no phones, no payment info, no customer IDs.
-- ---------------------------------------------------------------------
create or replace function public.get_public_venue_state(p_branch_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_branch record;
  v_stations jsonb;
  v_queue_by_game jsonb;
  v_summary jsonb;
begin
  -- Branch must be active for public visibility
  select b.id, b.tenant_id, b.code, b.display_name, b.city, b.opens_at, b.closes_at, b.status, b.queue_policy
  into v_branch
  from public.branches b
  where b.id = p_branch_id and b.status = 'active';

  if v_branch is null then
    return jsonb_build_object('error', 'branch_not_found_or_inactive');
  end if;

  -- Stations: anonymized status + ETA, NO customer info
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', s.id,
    'code', s.code,
    'display_name', s.display_name,
    'game_type_code', gt.code,
    'game_type_name_ar', gt.display_name_ar,
    'game_type_name_en', gt.display_name_en,
    'icon', gt.icon,
    'status', s.status,
    'position_x', s.position_x,
    'position_y', s.position_y,
    -- Pull the live session's ends_at if any, ELSE null
    'estimated_free_at', (
      select sess.ends_at
      from public.sessions sess
      where sess.station_id = s.id
        and sess.status in ('active','paused')
      order by sess.started_at desc
      limit 1
    )
  ) order by gt.sort_order, s.code), '[]'::jsonb)
  into v_stations
  from public.stations s
  join public.game_types gt on gt.id = s.game_type_id
  where s.branch_id = p_branch_id and s.is_active = true;

  -- Queue depth per game type (waiting + called)
  select coalesce(jsonb_agg(jsonb_build_object(
    'game_type_code', gt.code,
    'game_type_name_ar', gt.display_name_ar,
    'game_type_name_en', gt.display_name_en,
    'icon', gt.icon,
    'waiting_count', q.waiting_count,
    'called_count', q.called_count,
    'now_serving_ticket', q.now_serving
  ) order by gt.sort_order), '[]'::jsonb)
  into v_queue_by_game
  from public.game_types gt
  left join lateral (
    select
      count(*) filter (where qt.status = 'waiting') as waiting_count,
      count(*) filter (where qt.status = 'called') as called_count,
      min(qt.ticket_number) filter (where qt.status = 'called') as now_serving
    from public.queue_tickets qt
    where qt.branch_id = p_branch_id
      and qt.game_type_id = gt.id
      and qt.created_at::date = current_date
  ) q on true
  where gt.tenant_id = v_branch.tenant_id and gt.is_active = true;

  -- Summary aggregates
  select jsonb_build_object(
    'total_stations', count(*) filter (where s.is_active),
    'available_count', count(*) filter (where s.is_active and s.status = 'available'),
    'occupied_count',  count(*) filter (where s.is_active and s.status = 'occupied'),
    'maintenance_count', count(*) filter (where s.is_active and s.status = 'maintenance')
  )
  into v_summary
  from public.stations s
  where s.branch_id = p_branch_id;

  return jsonb_build_object(
    'branch', jsonb_build_object(
      'id', v_branch.id,
      'code', v_branch.code,
      'display_name', v_branch.display_name,
      'city', v_branch.city,
      'opens_at', v_branch.opens_at,
      'closes_at', v_branch.closes_at,
      'queue_policy', v_branch.queue_policy
    ),
    'summary', v_summary,
    'stations', v_stations,
    'queue', v_queue_by_game,
    'fetched_at', now()
  );
end;
$$;

-- Allow anonymous (anon role) to call this function — but it returns NO PII.
grant execute on function public.get_public_venue_state(uuid) to anon, authenticated;

-- Also helper to find a branch by slug-ish code for friendlier URLs
create or replace function public.get_public_branch_by_code(p_branch_code text)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from public.branches
  where lower(code) = lower(p_branch_code)
    and status = 'active'
  limit 1;
$$;

grant execute on function public.get_public_branch_by_code(text) to anon, authenticated;

-- ---------------------------------------------------------------------
-- WALLET HELPER FUNCTIONS (atomic credit/debit)
-- ---------------------------------------------------------------------

-- Credit a wallet (returns the new ledger row + balance)
create or replace function public.wallet_credit(
  p_tenant_id uuid,
  p_customer_id uuid,
  p_amount_cents bigint,
  p_kind public.wallet_entry_kind,
  p_reason text default null,
  p_reference_type text default null,
  p_reference_id uuid default null,
  p_metadata jsonb default null,
  p_created_by uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_wallet public.wallets;
  v_ledger_id uuid;
begin
  if p_amount_cents <= 0 then
    raise exception 'wallet_credit amount must be positive';
  end if;

  -- Upsert wallet
  insert into public.wallets (tenant_id, customer_id, balance_cents)
  values (p_tenant_id, p_customer_id, 0)
  on conflict (tenant_id, customer_id) do nothing;

  update public.wallets
  set balance_cents = balance_cents + p_amount_cents,
      lifetime_credited_cents = lifetime_credited_cents + p_amount_cents,
      updated_at = now()
  where tenant_id = p_tenant_id and customer_id = p_customer_id
  returning * into v_wallet;

  insert into public.wallet_ledger
    (tenant_id, wallet_id, kind, delta_cents, balance_after_cents, reason, reference_type, reference_id, metadata, created_by)
  values
    (p_tenant_id, v_wallet.id, p_kind, p_amount_cents, v_wallet.balance_cents, p_reason, p_reference_type, p_reference_id, p_metadata, p_created_by)
  returning id into v_ledger_id;

  return jsonb_build_object(
    'wallet_id', v_wallet.id,
    'ledger_id', v_ledger_id,
    'balance_cents', v_wallet.balance_cents
  );
end;
$$;

-- Debit a wallet (returns the new ledger row + balance, fails if insufficient)
create or replace function public.wallet_debit(
  p_tenant_id uuid,
  p_customer_id uuid,
  p_amount_cents bigint,
  p_kind public.wallet_entry_kind,
  p_reason text default null,
  p_reference_type text default null,
  p_reference_id uuid default null,
  p_metadata jsonb default null,
  p_created_by uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_wallet public.wallets;
  v_ledger_id uuid;
begin
  if p_amount_cents <= 0 then
    raise exception 'wallet_debit amount must be positive';
  end if;

  -- Lock the wallet row
  select * into v_wallet
  from public.wallets
  where tenant_id = p_tenant_id and customer_id = p_customer_id
  for update;

  if v_wallet is null then
    raise exception 'wallet_not_found';
  end if;

  if v_wallet.is_frozen then
    raise exception 'wallet_frozen';
  end if;

  if v_wallet.balance_cents < p_amount_cents then
    raise exception 'insufficient_funds';
  end if;

  update public.wallets
  set balance_cents = balance_cents - p_amount_cents,
      lifetime_debited_cents = lifetime_debited_cents + p_amount_cents,
      updated_at = now()
  where id = v_wallet.id
  returning * into v_wallet;

  insert into public.wallet_ledger
    (tenant_id, wallet_id, kind, delta_cents, balance_after_cents, reason, reference_type, reference_id, metadata, created_by)
  values
    (p_tenant_id, v_wallet.id, p_kind, -p_amount_cents, v_wallet.balance_cents, p_reason, p_reference_type, p_reference_id, p_metadata, p_created_by)
  returning id into v_ledger_id;

  return jsonb_build_object(
    'wallet_id', v_wallet.id,
    'ledger_id', v_ledger_id,
    'balance_cents', v_wallet.balance_cents
  );
end;
$$;

-- Service-role only (these are called from server-side server actions)
revoke execute on function public.wallet_credit from public;
revoke execute on function public.wallet_debit from public;
grant execute on function public.wallet_credit  to service_role;
grant execute on function public.wallet_debit   to service_role;

-- ---------------------------------------------------------------------
-- RLS on wallets + ledger
-- ---------------------------------------------------------------------
alter table public.wallets enable row level security;
alter table public.wallet_ledger enable row level security;

-- Customer sees their own wallet
create policy "wallets_customer_self" on public.wallets
  for select using (customer_id = auth.uid());

-- Tenant members can read all wallets for ops
create policy "wallets_tenant_member_read" on public.wallets
  for select using (public.is_tenant_member(tenant_id));

-- Managers can adjust manually (writes via server actions use service role anyway)
create policy "wallets_manager_write" on public.wallets
  for all using (public.is_tenant_manager(tenant_id))
  with check (public.is_tenant_manager(tenant_id));

-- Ledger: same read rules; writes only via service-role functions
create policy "wallet_ledger_self_read" on public.wallet_ledger
  for select using (
    exists (
      select 1 from public.wallets w
      where w.id = wallet_ledger.wallet_id and w.customer_id = auth.uid()
    )
  );

create policy "wallet_ledger_tenant_read" on public.wallet_ledger
  for select using (public.is_tenant_member(tenant_id));
