-- =====================================================================
-- BOLOS ALLEY OS — Migration 00022
-- Wire the 'pending' session state (added in 00021) into station-status
-- sync, the overlap RPC, and the one-active-per-station guard.
--
-- Split into its own migration/transaction because Postgres will not let
-- a newly-added enum value be USED (compared/cast) in the same
-- transaction that added it via ALTER TYPE ... ADD VALUE.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Station status sync: a pending (paid, not-yet-started) session holds
-- its station as 'reserved' — a value that already exists in the
-- station_status enum and already has its own distinct badge in the UI
-- (StationCard), but until now nothing ever set it. 'active' still means
-- 'occupied'; Start (pending -> active) flips reserved -> occupied.
-- ---------------------------------------------------------------------
create or replace function public.sync_station_status()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' and new.status = 'pending' then
    update public.stations set status = 'reserved' where id = new.station_id;
  elsif tg_op = 'INSERT' and new.status = 'active' then
    update public.stations set status = 'occupied' where id = new.station_id;
  elsif tg_op = 'UPDATE' then
    if new.status in ('ended','frozen') and old.status not in ('ended','frozen') then
      update public.stations set status = 'available' where id = new.station_id;
    elsif new.status = 'active' and old.status = 'paused' then
      -- resume: station already occupied, no change needed
      null;
    elsif new.status = 'active' and old.status = 'pending' then
      -- Start tapped: station goes from held (reserved) to actually in use.
      update public.stations set status = 'occupied' where id = new.station_id;
    end if;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- Overlap RPC: a pending session must block a future booking on the same
-- station just like an active/paused one already does.
-- ---------------------------------------------------------------------
create or replace function public.is_station_free_for_window(
  p_station_id uuid,
  p_start timestamptz,
  p_end timestamptz,
  p_exclude_booking_id uuid default null
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if exists (
    select 1 from public.bookings b
    where b.station_id = p_station_id
      and b.status in ('confirmed','checked_in','in_session')
      and (p_exclude_booking_id is null or b.id <> p_exclude_booking_id)
      and b.scheduled_start_at < p_end
      and b.scheduled_end_at > p_start
  ) then
    return false;
  end if;

  if exists (
    select 1 from public.sessions s
    where s.station_id = p_station_id
      and s.status in ('active','paused','pending')
      and coalesce(s.ends_at, 'infinity'::timestamptz) > p_start
      and s.started_at < p_end
  ) then
    return false;
  end if;

  return true;
end;
$$;

-- ---------------------------------------------------------------------
-- Only one pending/active/paused session per station at a time.
-- ---------------------------------------------------------------------
drop index if exists uq_sessions_one_active_per_station;
create unique index uq_sessions_one_active_per_station
  on public.sessions(station_id)
  where status in ('active','paused','pending');
