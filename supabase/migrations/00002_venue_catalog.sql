-- =====================================================================
-- BOLOS ALLEY OS — Migration 00002
-- Venue catalog: game types, physical tables/stations, pricing
-- =====================================================================

create type public.game_category as enum (
  'billiard',
  'bowling',
  'ping_pong',
  'karaoke',
  'foosball',
  'ps5',
  'vr',
  'arcade',
  'other'
);

create type public.station_status as enum (
  'available',    -- free, ready to use
  'occupied',     -- session in progress
  'reserved',     -- held for upcoming booking
  'maintenance',  -- out of service
  'cleaning'      -- transitional
);

create type public.pricing_unit as enum (
  'per_minute',
  'per_hour',
  'per_session',  -- flat (e.g. bowling per game per player)
  'per_player_hour'
);

-- ---------------------------------------------------------------------
-- Game types: catalog per tenant (so Tenant A can have different config from Tenant B)
-- ---------------------------------------------------------------------
create table public.game_types (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  category public.game_category not null,
  code text not null,                       -- e.g. "pool_8ball", "bowling_lane"
  display_name_ar text not null,
  display_name_en text not null,
  description text,
  icon text,                                -- emoji or icon key
  min_players int default 1,
  max_players int default 6,
  default_duration_min int default 60,
  -- Bowling-specific (matches your PDF: 1-6 players ticket support)
  supports_player_count boolean not null default false,
  is_active boolean not null default true,
  sort_order int default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, code)
);

create index idx_game_types_tenant on public.game_types(tenant_id);
create index idx_game_types_active on public.game_types(tenant_id, is_active);

-- ---------------------------------------------------------------------
-- Stations: the physical 14 tables in your PDF (per branch)
-- ---------------------------------------------------------------------
create table public.stations (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  game_type_id uuid not null references public.game_types(id) on delete restrict,
  code text not null,                       -- e.g. "POOL-01", "BOWL-03"
  display_name text not null,
  status public.station_status not null default 'available',
  -- IFTTT smart-light binding (per-station; matches your PDF)
  ifttt_event_on text,
  ifttt_event_off text,
  ifttt_event_alert text,                   -- the "blinking" pre-end alert
  -- Display
  position_x int,                           -- for floor-plan layout
  position_y int,
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (branch_id, code)
);

create index idx_stations_branch on public.stations(branch_id);
create index idx_stations_tenant on public.stations(tenant_id);
create index idx_stations_status on public.stations(branch_id, status);
create index idx_stations_game_type on public.stations(game_type_id);

-- ---------------------------------------------------------------------
-- Pricing rules: flexible per game_type, time-of-day, day-of-week
-- ---------------------------------------------------------------------
create table public.pricing_rules (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  branch_id uuid references public.branches(id) on delete cascade,  -- null = applies to all branches
  game_type_id uuid not null references public.game_types(id) on delete cascade,
  name text not null,                       -- "Weekday Standard", "Weekend Peak"
  unit public.pricing_unit not null,
  amount_cents bigint not null,             -- store as halalas (1 SAR = 100)
  currency text not null default 'SAR',
  -- Schedule
  starts_at_time time,
  ends_at_time time,
  days_of_week int[],                       -- 0=Sun ... 6=Sat (postgres dow)
  valid_from date,
  valid_to date,
  priority int not null default 0,          -- higher wins
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_pricing_tenant on public.pricing_rules(tenant_id);
create index idx_pricing_game on public.pricing_rules(game_type_id);
create index idx_pricing_active on public.pricing_rules(is_active);

-- updated_at triggers
create trigger trg_game_types_touch before update on public.game_types
  for each row execute function public.touch_updated_at();
create trigger trg_stations_touch before update on public.stations
  for each row execute function public.touch_updated_at();
create trigger trg_pricing_touch before update on public.pricing_rules
  for each row execute function public.touch_updated_at();
