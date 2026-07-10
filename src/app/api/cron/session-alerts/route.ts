import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { fireNotification } from '@/lib/notifications';
import { fireIftttEvent } from '@/lib/ifttt';

export const runtime = 'nodejs';

// Cron endpoint: GET /api/cron/session-alerts
// Configure as a Vercel Cron (see vercel.json) running every minute, with
// CRON_SECRET set — Vercel sends `Authorization: Bearer $CRON_SECRET`
// automatically for cron-triggered invocations.
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
  const soon = new Date(now.getTime() + 5 * 60_000);

  const { data: sessions, error } = await admin
    .from('sessions')
    .select('id, tenant_id, branch_id, station_id, customer_id, ends_at')
    .eq('status', 'active')
    .eq('alert_fired', false)
    .gte('ends_at', now.toISOString())
    .lte('ends_at', soon.toISOString());

  if (error) {
    console.error('[cron/session-alerts] query failed', error);
    return NextResponse.json({ error: 'query_failed' }, { status: 500 });
  }

  let notified = 0;
  let lightsFired = 0;
  const failedSessionIds: string[] = [];

  for (const session of sessions ?? []) {
    try {
      if (session.customer_id && session.ends_at) {
        const { data: profile } = await admin
          .from('profiles')
          .select('full_name')
          .eq('id', session.customer_id)
          .maybeSingle();
        const minutesLeft = Math.max(1, Math.round((new Date(session.ends_at).getTime() - now.getTime()) / 60_000));

        fireNotification({
          tenantId: session.tenant_id,
          customerId: session.customer_id,
          templateCode: 'session_ending_soon',
          params: { name: profile?.full_name ?? '', minutesLeft: String(minutesLeft) },
          referenceType: 'session',
          referenceId: session.id,
        });
        notified++;
      }

      // Reuse the existing IFTTT smart-light alert, if this station + branch has one configured.
      const [{ data: station }, { data: branch }] = await Promise.all([
        admin.from('stations').select('ifttt_event_alert').eq('id', session.station_id).maybeSingle(),
        admin.from('branches').select('ifttt_webhook_key').eq('id', session.branch_id).maybeSingle(),
      ]);
      if (station?.ifttt_event_alert && branch?.ifttt_webhook_key) {
        void fireIftttEvent(station.ifttt_event_alert, branch.ifttt_webhook_key);
        lightsFired++;
      }

      await admin.from('sessions').update({ alert_fired: true }).eq('id', session.id);
    } catch (err) {
      console.error('[cron/session-alerts] failed for session', session.id, err);
      failedSessionIds.push(session.id);
    }
  }

  return NextResponse.json({
    ok: true,
    checked: sessions?.length ?? 0,
    notified,
    lightsFired,
    failed: failedSessionIds,
  });
}
