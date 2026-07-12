import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Whether a station is free for [start, end) — no overlapping reservation
 * (confirmed/checked_in/in_session booking) and no overlapping live/paused
 * session. Backed by the is_station_free_for_window() Postgres function
 * (see migration 00011) so every caller (instant booking, scheduled
 * booking, cashier walk-in, queue seating) shares one source of truth.
 *
 * Deliberately kept dependency-free (no imports from booking.ts/cashier.ts/
 * queue.ts) since all three of those need to call it — importing it from
 * one of them would create a circular import.
 */
export async function isStationFreeForWindow(
  stationId: string,
  startIso: string,
  endIso: string,
  excludeBookingId?: string
): Promise<boolean> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc('is_station_free_for_window', {
    p_station_id: stationId,
    p_start: startIso,
    p_end: endIso,
    p_exclude_booking_id: excludeBookingId ?? null,
  });
  if (error) throw error;
  return !!data;
}
