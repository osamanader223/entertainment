import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';

export interface ReservationBoardRow {
  bookingId: string;
  referenceCode: string;
  stationCode: string;
  stationName: string;
  gameTypeName: string;
  customerName: string | null;
  customerPhone: string | null;
  scheduledStartAt: string;
  scheduledEndAt: string;
  durationMinutes: number;
  status: string;
  customerPresent: boolean;
  minutesUntilStart: number; // negative if already started
}

/** All of a branch's reservations for a given day (default: today), for the cashier board. */
export async function getReservationBoard(tenantId: string, branchId: string, date?: string): Promise<ReservationBoardRow[]> {
  const admin = createAdminClient();

  const targetDate = date ? new Date(date) : new Date();
  const dayStart = new Date(targetDate);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(targetDate);
  dayEnd.setHours(23, 59, 59, 999);

  const { data, error } = await admin
    .from('bookings')
    .select('id, reference_code, station_id, game_type_id, customer_id, scheduled_start_at, scheduled_end_at, duration_minutes, status, customer_present')
    .eq('tenant_id', tenantId)
    .eq('branch_id', branchId)
    .eq('booking_mode', 'scheduled')
    .in('status', ['confirmed', 'checked_in', 'in_session'])
    .gte('scheduled_start_at', dayStart.toISOString())
    .lte('scheduled_start_at', dayEnd.toISOString())
    .order('scheduled_start_at', { ascending: true });
  if (error) throw error;
  if (!data || data.length === 0) return [];

  const stationIds = [...new Set(data.map((b) => b.station_id).filter((id): id is string => !!id))];
  const gameTypeIds = [...new Set(data.map((b) => b.game_type_id))];
  const customerIds = [...new Set(data.map((b) => b.customer_id).filter((id): id is string => !!id))];

  const [{ data: stations }, { data: gameTypes }, { data: profiles }] = await Promise.all([
    stationIds.length
      ? admin.from('stations').select('id, code, display_name').in('id', stationIds)
      : Promise.resolve({ data: [] as Array<{ id: string; code: string; display_name: string }> }),
    admin.from('game_types').select('id, display_name_en, display_name_ar').in('id', gameTypeIds),
    customerIds.length
      ? admin.from('profiles').select('id, full_name, phone').in('id', customerIds)
      : Promise.resolve({ data: [] as Array<{ id: string; full_name: string | null; phone: string | null }> }),
  ]);
  const stationMap = new Map((stations ?? []).map((s) => [s.id, s]));
  const gameTypeMap = new Map((gameTypes ?? []).map((g) => [g.id, g.display_name_ar ?? g.display_name_en]));
  const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]));

  const now = Date.now();
  return data.map((b) => {
    const station = b.station_id ? stationMap.get(b.station_id) : undefined;
    const profile = b.customer_id ? profileMap.get(b.customer_id) : undefined;
    return {
      bookingId: b.id,
      referenceCode: b.reference_code,
      stationCode: station?.code ?? '—',
      stationName: station?.display_name ?? '—',
      gameTypeName: gameTypeMap.get(b.game_type_id) ?? '',
      customerName: profile?.full_name ?? null,
      customerPhone: profile?.phone ?? null,
      scheduledStartAt: b.scheduled_start_at,
      scheduledEndAt: b.scheduled_end_at ?? b.scheduled_start_at,
      durationMinutes: b.duration_minutes ?? 0,
      status: b.status,
      customerPresent: b.customer_present,
      minutesUntilStart: Math.round((new Date(b.scheduled_start_at).getTime() - now) / 60_000),
    };
  });
}
