-- =====================================================================
-- BOLOS ALLEY OS — Migration 00003
-- Bookings, live sessions, queue tickets, frozen balances
-- (Matches PDF features: 14-station control, open/30/60 min, frozen balances,
--  bowling 1-6 player tickets, master reset, pause)
-- =====================================================================

create type public.booking_status as enum (
  'pending',       -- awaiting payment / confirmation
  'confirmed',     -- paid / reserved
  'checked_in',    -- customer arrived
  'in_session',    -- linked to active session
  'completed',
  'cancelled',
  'no_show',
  'expired'
);

create type public.session_status as enum (
  'active',        -- currently running
  'paused',        -- timer paused (your PDF "pause" feature)
  'extended',
  'ended',
  'frozen'         -- balance saved for later resume (your PDF feature)
);

create type public.queue_ticket_status as enum (
  'waiting',
  'called',        -- staff called this party to play
  'seated',        -- moved into session
  'expired',       -- didn't show up in window
  'cancelled'
);

create type public.duration_mode as enum (
  'open',          -- open-ended (your PDF "open" option)
  'fixed_30',
  'fixed_60',
  'custom'
);

-- ---------------------------------------------------------------------
-- Bookings: a reservation made in advance (or walk-in)
-- ---------------------------------------------------------------------
create table public.bookings (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  customer_id uuid references public.profiles(id) on delete set null,
  game_type_id uuid not null references public.game_types(id) on delete restrict,
  station_id uuid references public.stations(id) on delete set null, -- assigned at check-in
  -- Booking details
  player_count int not null default 1,
  duration_mode public.duration_mode not null default 'fixed_60',
  duration_minutes int,                      -- null when open-ended
  scheduled_start_at timestamptz not null,
  scheduled_end_at timestamptz,
  -- Pricing
  estimated_amount_cents bigint default 0,
  deposit_amount_cents bigint default 0,
  currency text not null default 'SAR',
  -- Status
  status public.booking_status not null default 'pending',
  source text default 'app',                 -- app | whatsapp | walk_in | admin
  notes text,
  -- Customer-facing identifiers
  reference_code text unique not null default upper(substring(replace(uuid_generate_v4()::text,'-',''),1,8)),
  -- Lifecycle
  confirmed_at timestamptz,
  checked_in_at timestamptz,
  cancelled_at timestamptz,
  cancelled_reason text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_bookings_tenant on public.bookings(tenant_id);
create index idx_bookings_branch on public.bookings(branch_id);
create index idx_bookings_customer on public.bookings(customer_id);
create index idx_bookings_station on public.bookings(station_id);
create index idx_bookings_status on public.bookings(branch_id, status);
create index idx_bookings_scheduled on public.bookings(scheduled_start_at);

-- ---------------------------------------------------------------------
-- Sessions: the live, ticking play session on a station
-- ---------------------------------------------------------------------
create table public.sessions (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  station_id uuid not null references public.stations(id) on delete restrict,
  booking_id uuid references public.bookings(id) on delete set null,
  customer_id uuid references public.profiles(id) on delete set null,
  -- Players
  player_count int not null default 1,
  customer_label text,                       -- for walk-ins without account: "Ahmed", "Khalid"
  -- Timer
  duration_mode public.duration_mode not null default 'fixed_60',
  planned_duration_seconds int,              -- null = open
  started_at timestamptz not null default now(),
  ends_at timestamptz,                       -- computed from started_at + planned
  -- Pause accounting (your PDF pause feature)
  total_paused_seconds int not null default 0,
  paused_at timestamptz,                     -- non-null while paused
  -- Frozen balance (your PDF feature: save remaining time to resume later)
  frozen_remaining_seconds int,              -- non-null if status = frozen
  frozen_at timestamptz,
  resumed_from_session_id uuid references public.sessions(id),
  -- Status
  status public.session_status not null default 'active',
  -- Final accounting
  actual_duration_seconds int,
  final_amount_cents bigint,
  alert_fired boolean not null default false, -- pre-end light blink fired
  ended_at timestamptz,
  ended_by uuid references public.profiles(id),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_sessions_tenant on public.sessions(tenant_id);
create index idx_sessions_branch on public.sessions(branch_id);
create index idx_sessions_station on public.sessions(station_id);
create index idx_sessions_status on public.sessions(branch_id, status);
create index idx_sessions_active on public.sessions(branch_id) where status in ('active','paused');
create index idx_sessions_customer on public.sessions(customer_id);
create index idx_sessions_started on public.sessions(started_at desc);

-- One active/paused session per station at a time
create unique index uq_sessions_one_active_per_station
  on public.sessions(station_id)
  where status in ('active','paused');

-- ---------------------------------------------------------------------
-- Frozen balances: explicit ledger for resume-later (your PDF feature)
-- ---------------------------------------------------------------------
create table public.frozen_balances (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  customer_id uuid references public.profiles(id) on delete set null,
  customer_label text,                       -- for walk-ins
  game_type_id uuid not null references public.game_types(id) on delete restrict,
  source_session_id uuid references public.sessions(id) on delete set null,
  remaining_seconds int not null check (remaining_seconds > 0),
  notes text,
  is_consumed boolean not null default false,
  consumed_session_id uuid references public.sessions(id),
  consumed_at timestamptz,
  expires_at timestamptz,                    -- optional auto-expiry
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_frozen_tenant on public.frozen_balances(tenant_id);
create index idx_frozen_branch on public.frozen_balances(branch_id);
create index idx_frozen_customer on public.frozen_balances(customer_id);
create index idx_frozen_unconsumed on public.frozen_balances(branch_id) where is_consumed = false;

-- ---------------------------------------------------------------------
-- Queue tickets (walk-in waiting list, bowling-aware)
-- Matches your PDF: ticket #1, Ahmed -> Bowling (4 players)
-- ---------------------------------------------------------------------
create table public.queue_tickets (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  game_type_id uuid not null references public.game_types(id) on delete restrict,
  customer_id uuid references public.profiles(id) on delete set null,
  customer_label text,                       -- "Ahmed" if no account
  customer_phone text,                       -- for WhatsApp notify
  player_count int not null default 1,
  -- Numbering (per-branch, per-day, per-game-type)
  ticket_number int not null,
  is_vip boolean not null default false,     -- VIP queue priority
  -- Status
  status public.queue_ticket_status not null default 'waiting',
  estimated_wait_minutes int,                -- AI-predicted
  called_at timestamptz,
  seated_at timestamptz,
  seated_session_id uuid references public.sessions(id),
  expired_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_queue_branch on public.queue_tickets(branch_id);
create index idx_queue_tenant on public.queue_tickets(tenant_id);
create index idx_queue_status on public.queue_tickets(branch_id, status);
create index idx_queue_waiting on public.queue_tickets(branch_id, game_type_id, is_vip desc, created_at)
  where status = 'waiting';

-- updated_at triggers
create trigger trg_bookings_touch before update on public.bookings
  for each row execute function public.touch_updated_at();
create trigger trg_sessions_touch before update on public.sessions
  for each row execute function public.touch_updated_at();
create trigger trg_frozen_touch before update on public.frozen_balances
  for each row execute function public.touch_updated_at();
create trigger trg_queue_touch before update on public.queue_tickets
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- Auto-set ends_at when a fixed-duration session starts
-- ---------------------------------------------------------------------
create or replace function public.set_session_ends_at()
returns trigger language plpgsql as $$
begin
  if new.planned_duration_seconds is not null and new.ends_at is null then
    new.ends_at := new.started_at + (new.planned_duration_seconds * interval '1 second');
  end if;
  return new;
end;
$$;

create trigger trg_sessions_compute_end
  before insert on public.sessions
  for each row execute function public.set_session_ends_at();

-- ---------------------------------------------------------------------
-- Auto-set station status when session starts/ends
-- ---------------------------------------------------------------------
create or replace function public.sync_station_status()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' and new.status = 'active' then
    update public.stations set status = 'occupied' where id = new.station_id;
  elsif tg_op = 'UPDATE' then
    if new.status in ('ended','frozen') and old.status not in ('ended','frozen') then
      update public.stations set status = 'available' where id = new.station_id;
    elsif new.status = 'active' and old.status = 'paused' then
      -- resume: station already occupied, no change needed
      null;
    end if;
  end if;
  return new;
end;
$$;

create trigger trg_sessions_sync_station
  after insert or update on public.sessions
  for each row execute function public.sync_station_status();
