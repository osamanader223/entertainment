-- =========================================================================
-- Bowling duration + pricing inputs.
--
-- Bowling isn't time-based like the other game types — customers pick a
-- player count and single/double game instead of a duration. We have no
-- historical session data yet, so duration is estimated from a small,
-- admin-editable formula (base + per-player-per-game minutes, clamped and
-- rounded to the 30-minute slot grid). player_count/game_count and the
-- predicted vs. actual duration are recorded on every booking/session so a
-- future learning engine can fit real coefficients once there's enough data.
-- =========================================================================

-- Per-game-type duration formula coefficients, editable in admin.
create table if not exists public.game_duration_params (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  game_type_id uuid not null references public.game_types(id) on delete cascade,
  base_minutes int not null default 10,
  minutes_per_player_per_game numeric(5,2) not null default 9.0,
  min_minutes int not null default 20,
  max_minutes int not null default 180,
  updated_at timestamptz not null default now(),
  unique (tenant_id, game_type_id)
);
alter table public.game_duration_params enable row level security;

create policy "game_duration_params_staff_read" on public.game_duration_params
  for select using (public.is_tenant_member(tenant_id));

create policy "game_duration_params_manager_write" on public.game_duration_params
  for all using (public.is_tenant_manager(tenant_id))
  with check (public.is_tenant_manager(tenant_id));

create trigger trg_game_duration_params_touch before update on public.game_duration_params
  for each row execute function public.touch_updated_at();

-- Record actuals for a future learning engine.
alter table public.bookings
  add column if not exists player_count int,
  add column if not exists game_count int;
alter table public.sessions
  add column if not exists player_count int,
  add column if not exists game_count int,
  add column if not exists predicted_duration_minutes int,
  add column if not exists actual_duration_minutes int;

-- Seed bowling defaults for the demo tenant.
insert into public.game_duration_params (tenant_id, game_type_id, base_minutes, minutes_per_player_per_game)
select '11111111-1111-1111-1111-111111111111', id, 10, 9.0
from public.game_types where code ilike '%bowl%'
on conflict (tenant_id, game_type_id) do nothing;
