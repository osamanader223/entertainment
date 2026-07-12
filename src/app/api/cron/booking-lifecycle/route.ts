import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { markBookingNoShow, startScheduledBookingSession } from '@/lib/booking';
import { fireNotification } from '@/lib/notifications';

export const runtime = 'nodejs';

const NO_SHOW_CUTOFF_MINUTES = 10;
const REMINDER_WINDOW_MIN_MINUTES = 25;
const REMINDER_WINDOW_MAX_MINUTES = 35;

// Cron endpoint: GET /api/cron/booking-lifecycle
// Configure as a Vercel Cron (see vercel.json) running every minute, with
// CRON_SECRET set — Vercel sends `Authorization: Bearer $CRON_SECRET`
// automatically for cron-triggered invocations.
//
// Three jobs, in this order (no-show first so auto-start never fires for a
// booking that just got forfeited in the same tick):
//   1. No-show sweep — not present by (scheduled_start_at - 10min) → forfeit + release slot.
//   2. Auto-start sweep — at/after scheduled_start_at and still confirmed/checked_in → start the session.
//   3. Reminder — ~30 min before start, best-effort WhatsApp nudge.
function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const authHeader = req.headers.get('authorization');
  if (authHeader === `Bearer ${secret}`) return true;
  return req.nextUrl.searchParams.get('secret') === secret;
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const admin = createAdminClient();
  const now = new Date();

  // ---- 1. No-show sweep ----
  const noShowCutoffStart = new Date(now.getTime() + NO_SHOW_CUTOFF_MINUTES * 60_000);
  const { data: noShowCandidates } = await admin
    .from('bookings')
    .select('id, tenant_id')
    .eq('status', 'confirmed')
    .eq('booking_mode', 'scheduled')
    .eq('customer_present', false)
    .lte('scheduled_start_at', noShowCutoffStart.toISOString());

  let noShowCount = 0;
  const noShowFailed: string[] = [];
  for (const b of noShowCandidates ?? []) {
    try {
      await markBookingNoShow(b.id, b.tenant_id, null);
      noShowCount++;
    } catch (err) {
      console.error('[cron/booking-lifecycle] no-show failed', b.id, err);
      noShowFailed.push(b.id);
    }
  }

  // ---- 2. Auto-start sweep ----
  const { data: startCandidates } = await admin
    .from('bookings')
    .select('id, tenant_id')
    .in('status', ['confirmed', 'checked_in'])
    .eq('booking_mode', 'scheduled')
    .lte('scheduled_start_at', now.toISOString());

  let startedCount = 0;
  const startFailed: string[] = [];
  for (const b of startCandidates ?? []) {
    try {
      await startScheduledBookingSession(b.id, b.tenant_id, null, true);
      startedCount++;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // Expected transient states from this same sweep (just no-showed, or
      // already started by a concurrent request) — not real failures.
      if (message !== 'already_started' && message !== 'booking_not_startable') {
        console.error('[cron/booking-lifecycle] auto-start failed', b.id, err);
        startFailed.push(b.id);
      }
    }
  }

  // ---- 3. Reminder (~30 min before start) ----
  const reminderWindowStart = new Date(now.getTime() + REMINDER_WINDOW_MIN_MINUTES * 60_000);
  const reminderWindowEnd = new Date(now.getTime() + REMINDER_WINDOW_MAX_MINUTES * 60_000);
  const { data: reminderCandidates } = await admin
    .from('bookings')
    .select('id, tenant_id, customer_id, station_id, scheduled_start_at')
    .in('status', ['confirmed', 'checked_in'])
    .eq('booking_mode', 'scheduled')
    .gte('scheduled_start_at', reminderWindowStart.toISOString())
    .lte('scheduled_start_at', reminderWindowEnd.toISOString());

  let remindersSent = 0;
  for (const b of reminderCandidates ?? []) {
    if (!b.customer_id) continue;
    try {
      const [{ data: profile }, { data: station }] = await Promise.all([
        admin.from('profiles').select('full_name').eq('id', b.customer_id).maybeSingle(),
        b.station_id
          ? admin.from('stations').select('display_name').eq('id', b.station_id).maybeSingle()
          : Promise.resolve({ data: null }),
      ]);

      fireNotification({
        tenantId: b.tenant_id,
        customerId: b.customer_id,
        templateCode: 'booking_reminder',
        params: {
          name: profile?.full_name ?? '',
          stationName: station?.display_name ?? '',
          startTime: new Date(b.scheduled_start_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
        },
        referenceType: 'booking',
        referenceId: b.id,
      });
      remindersSent++;
    } catch (err) {
      console.error('[cron/booking-lifecycle] reminder failed', b.id, err);
    }
  }

  return NextResponse.json({
    ok: true,
    noShow: noShowCount,
    noShowFailed,
    started: startedCount,
    startFailed,
    remindersSent,
  });
}
