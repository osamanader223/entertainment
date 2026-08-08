import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { runLightSequence } from '@/lib/ifttt';
import { fireNotification } from '@/lib/notifications';

export interface EndActiveSessionResult {
  sessionId: string | null;
  alreadyEnded: boolean;
}

export interface ActiveSessionRow {
  sessionId: string;
  stationId: string;
  stationCode: string;
  stationDisplayName: string;
  customerName: string | null;
  startedAt: string;
  endsAt: string | null;
  status: 'active' | 'paused';
}

/**
 * Staff-only view of every currently running session on a branch, with real
 * customer names — unlike the public venue state (get_public_venue_state),
 * which is deliberately anonymized and only exposes station status. Powers
 * the cashier's "running sessions" panel (end-from-the-same-screen).
 */
export async function getActiveSessionsForBranch(tenantId: string, branchId: string): Promise<ActiveSessionRow[]> {
  const admin = createAdminClient();
  const { data: sessionsRaw, error } = await admin
    .from('sessions')
    .select('id, station_id, customer_id, customer_label, started_at, ends_at, status')
    .eq('tenant_id', tenantId)
    .eq('branch_id', branchId)
    .in('status', ['active', 'paused'])
    .order('started_at', { ascending: true });
  if (error) throw error;
  const sessions = sessionsRaw ?? [];
  if (sessions.length === 0) return [];

  const stationIds = [...new Set(sessions.map((s) => s.station_id))];
  const customerIds = [...new Set(sessions.map((s) => s.customer_id).filter((id): id is string => !!id))];

  const [{ data: stationsRaw }, { data: profilesRaw }] = await Promise.all([
    admin.from('stations').select('id, code, display_name').in('id', stationIds),
    customerIds.length
      ? admin.from('profiles').select('id, full_name').in('id', customerIds)
      : Promise.resolve({ data: [] as Array<{ id: string; full_name: string | null }> }),
  ]);
  const stationMap = new Map((stationsRaw ?? []).map((s) => [s.id, s]));
  const profileMap = new Map((profilesRaw ?? []).map((p) => [p.id, p.full_name]));

  return sessions.map((s) => {
    const station = stationMap.get(s.station_id);
    return {
      sessionId: s.id,
      stationId: s.station_id,
      stationCode: station?.code ?? '—',
      stationDisplayName: station?.display_name ?? '—',
      customerName: (s.customer_id ? profileMap.get(s.customer_id) : null) ?? s.customer_label ?? null,
      startedAt: s.started_at,
      endsAt: s.ends_at,
      status: s.status as 'active' | 'paused',
    };
  });
}

/**
 * Ends the currently active/paused session for a station (if any) and logs
 * the action. Idempotent — calling this when no active session exists is a
 * no-op. The sync_station_status trigger flips the station back to
 * 'available' once the session row's status moves to 'ended'.
 */
export async function endActiveSessionForStation({
  stationId,
  tenantId,
  branchId,
  endedBy,
}: {
  stationId: string;
  tenantId: string;
  branchId: string;
  endedBy: string;
}): Promise<EndActiveSessionResult> {
  const admin = createAdminClient();

  const { data: session, error: sessionError } = await admin
    .from('sessions')
    .select('id, customer_id, started_at, total_paused_seconds')
    .eq('station_id', stationId)
    .eq('tenant_id', tenantId)
    .in('status', ['active', 'paused'])
    .maybeSingle();

  if (sessionError) throw sessionError;
  if (!session) return { sessionId: null, alreadyEnded: true };

  const now = new Date();
  const elapsedSeconds = Math.floor((now.getTime() - new Date(session.started_at).getTime()) / 1000);
  const actualDurationSeconds = Math.max(0, elapsedSeconds - session.total_paused_seconds);

  const { error: updateError } = await admin
    .from('sessions')
    .update({
      status: 'ended',
      ended_at: now.toISOString(),
      ended_by: endedBy,
      actual_duration_seconds: actualDurationSeconds,
      // Training data for the future duration-learning engine (see lib/bowling.ts).
      actual_duration_minutes: Math.round(actualDurationSeconds / 60),
    } as never)
    .eq('id', session.id);

  if (updateError) throw updateError;

  await admin.from('activity_log').insert({
    tenant_id: tenantId,
    branch_id: branchId,
    actor_id: endedBy,
    actor_role: 'staff',
    action: 'session.confirmed_ended',
    entity_type: 'session',
    entity_id: session.id,
    after: { ended_at: now.toISOString(), actual_duration_seconds: actualDurationSeconds },
  });

  void fireEndLightSequence(stationId, branchId);
  void fireSessionEndedNotification(tenantId, session.id, session.customer_id);

  return { sessionId: session.id, alreadyEnded: false };
}

/** Fire-and-forget: runs the END smart-light sequence for a station, if the branch has IFTTT configured. */
async function fireEndLightSequence(stationId: string, branchId: string): Promise<void> {
  const admin = createAdminClient();

  const [{ data: station }, { data: branch }] = await Promise.all([
    admin.from('stations').select('code, game_type_id').eq('id', stationId).maybeSingle(),
    admin.from('branches').select('ifttt_webhook_key').eq('id', branchId).maybeSingle(),
  ]);

  if (!station || !branch?.ifttt_webhook_key) return;

  const { data: gameType } = await admin
    .from('game_types')
    .select('category')
    .eq('id', station.game_type_id)
    .maybeSingle();

  if (!gameType) return;

  void runLightSequence({ code: station.code, gameCategory: gameType.category }, 'END', branch.ifttt_webhook_key);
}

/**
 * Fire-and-forget: WhatsApp "session ended, here's what you earned" notification.
 * NOTE: points for this session were awarded earlier (at booking/queue-join/cashier
 * start time, not here) — this looks up the loyalty_ledger entry keyed to this
 * session to report what was earned. Queue-seated sessions award points keyed to
 * the queue_ticket instead, so pointsEarned will read 0 for those (a known gap,
 * not something this notification introduces).
 */
async function fireSessionEndedNotification(
  tenantId: string,
  sessionId: string,
  customerId: string | null
): Promise<void> {
  if (!customerId) return;
  try {
    const admin = createAdminClient();

    const [{ data: profile }, { data: ledgerEntry }, { data: loyaltyAccount }] = await Promise.all([
      admin.from('profiles').select('full_name').eq('id', customerId).maybeSingle(),
      admin
        .from('loyalty_ledger')
        .select('delta_points')
        .eq('reference_type', 'session')
        .eq('reference_id', sessionId)
        .gt('delta_points', 0)
        .maybeSingle(),
      admin.from('loyalty_accounts').select('points_balance').eq('tenant_id', tenantId).eq('customer_id', customerId).maybeSingle(),
    ]);

    fireNotification({
      tenantId,
      customerId,
      templateCode: 'session_ended_points',
      params: {
        name: profile?.full_name ?? '',
        pointsEarned: String(ledgerEntry?.delta_points ?? 0),
        pointsBalance: String(loyaltyAccount?.points_balance ?? 0),
      },
      referenceType: 'session',
      referenceId: sessionId,
    });
  } catch (err) {
    console.error('[sessions] fireSessionEndedNotification failed', err);
  }
}
