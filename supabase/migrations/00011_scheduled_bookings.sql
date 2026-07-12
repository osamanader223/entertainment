-- =====================================================================
-- BOLOS ALLEY OS — Migration 00011
-- Scheduled bookings: reserve a station for a future date/time, with
-- overlap prevention, cashier check-in, auto-start, and no-show forfeit.
-- Run this in Supabase SQL editor before testing scheduled bookings.
-- =====================================================================

-- Booking mode + presence tracking
alter table public.bookings
  add column if not exists booking_mode text not null default 'instant'
    check (booking_mode in ('instant','scheduled')),
  add column if not exists customer_present boolean not null default false,   -- cashier marked them arrived
  add column if not exists present_marked_at timestamptz,
  add column if not exists no_show_at timestamptz,
  add column if not exists auto_started boolean not null default false,
  add column if not exists slot_released boolean not null default false;

-- Fast lookup of reservations by station + time window (for overlap checks + cashier board)
create index if not exists idx_bookings_station_window
  on public.bookings(station_id, scheduled_start_at, scheduled_end_at)
  where status in ('confirmed','checked_in','in_session');

create index if not exists idx_bookings_upcoming
  on public.bookings(branch_id, scheduled_start_at)
  where status in ('confirmed','checked_in') and booking_mode = 'scheduled';

-- Overlap-check helper: returns true if a station is FREE for a given window
-- (no overlapping active reservation and no overlapping active session)
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
  -- Any overlapping reservation?
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

  -- Any overlapping live/paused session not tied to a booking (walk-ins)?
  -- A session occupies [started_at, ends_at]; if ends_at is null (open-ended), treat as blocking from started_at onward.
  if exists (
    select 1 from public.sessions s
    where s.station_id = p_station_id
      and s.status in ('active','paused')
      and coalesce(s.ends_at, 'infinity'::timestamptz) > p_start
      and s.started_at < p_end
  ) then
    return false;
  end if;

  return true;
end;
$$;
grant execute on function public.is_station_free_for_window(uuid, timestamptz, timestamptz, uuid) to anon, authenticated, service_role;
