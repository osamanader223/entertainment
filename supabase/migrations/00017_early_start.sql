-- =====================================================================
-- Flexible early-start for booked sessions.
--
-- A booking can be started before its scheduled time, shifting the whole
-- window earlier while keeping the full booked duration. See
-- src/lib/booking.ts:startBookingEarly for the overlap-aware logic that
-- uses these columns.
-- =====================================================================

-- Per-branch cap on how early a booking may be started. NULL = unlimited
-- (the default — "no fixed early limit for now", per the product decision).
alter table public.branches
  add column if not exists early_start_window_minutes int;

alter table public.branches drop constraint if exists branches_early_start_window_check;
alter table public.branches
  add constraint branches_early_start_window_check
  check (early_start_window_minutes is null or early_start_window_minutes >= 0);

-- Set when a DIFFERENT booking's early start was force-started through a
-- collision with this booking's slot — a visible flag so staff reviewing
-- this booking later know its station may already be occupied.
alter table public.bookings
  add column if not exists early_start_collision boolean not null default false,
  add column if not exists early_start_collision_note text;
