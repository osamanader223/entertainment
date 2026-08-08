import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { runLightSequence } from '@/lib/ifttt';
import { fireNotification } from '@/lib/notifications';
import { fireStartLightSequence } from '@/lib/cashier';

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

export interface PendingSessionRow {
  sessionId: string;
  stationId: string;
  stationCode: string;
  stationDisplayName: string;
  customerName: string | null;
  gameTypeName: string;
  addedAt: string;
}

/**
 * Sessions added to a basket and PAID (their cart is settled) but not yet
 * started — no timer, no lights, station held as 'reserved'. Excludes
 * sessions still sitting in an open/unpaid cart: those aren't "ready to
 * start" yet, they're still being shopped. Joined through cart_items ->
 * carts the same manual-join way the rest of carts.ts/invoices.ts does,
 * since sessions has no direct cart_id column.
 */
export async function getPendingSessionsForBranch(tenantId: string, branchId: string): Promise<PendingSessionRow[]> {
  const admin = createAdminClient();
  const { data: sessionsRaw, error } = await admin
    .from('sessions')
    .select('id, station_id, customer_id, customer_label, created_at')
    .eq('tenant_id', tenantId)
    .eq('branch_id', branchId)
    .eq('status', 'pending')
    .order('created_at', { ascending: true });
  if (error) throw error;
  const sessions = sessionsRaw ?? [];
  if (sessions.length === 0) return [];

  const sessionIds = sessions.map((s) => s.id);
  const { data: cartItemsRaw } = await admin.from('cart_items').select('session_id, cart_id').in('session_id', sessionIds);
  const cartIdBySession = new Map((cartItemsRaw ?? []).map((ci) => [ci.session_id, ci.cart_id]));

  const cartIds = [...new Set([...cartIdBySession.values()].filter((id): id is string => !!id))];
  const { data: settledCartsRaw } = cartIds.length
    ? await admin.from('carts').select('id').in('id', cartIds).eq('status', 'settled')
    : { data: [] as Array<{ id: string }> };
  const settledCartIds = new Set((settledCartsRaw ?? []).map((c) => c.id));

  const paidSessions = sessions.filter((s) => {
    const cartId = cartIdBySession.get(s.id);
    return !!cartId && settledCartIds.has(cartId);
  });
  if (paidSessions.length === 0) return [];

  const stationIds = [...new Set(paidSessions.map((s) => s.station_id))];
  const customerIds = [...new Set(paidSessions.map((s) => s.customer_id).filter((id): id is string => !!id))];

  const [{ data: stationsRaw }, { data: profilesRaw }] = await Promise.all([
    admin.from('stations').select('id, code, display_name, game_type_id').in('id', stationIds),
    customerIds.length
      ? admin.from('profiles').select('id, full_name').in('id', customerIds)
      : Promise.resolve({ data: [] as Array<{ id: string; full_name: string | null }> }),
  ]);
  const stationMap = new Map((stationsRaw ?? []).map((s) => [s.id, s]));
  const profileMap = new Map((profilesRaw ?? []).map((p) => [p.id, p.full_name]));

  const gameTypeIds = [...new Set((stationsRaw ?? []).map((s) => s.game_type_id))];
  const { data: gameTypesRaw } = gameTypeIds.length
    ? await admin.from('game_types').select('id, display_name_en').in('id', gameTypeIds)
    : { data: [] as Array<{ id: string; display_name_en: string }> };
  const gameTypeMap = new Map((gameTypesRaw ?? []).map((g) => [g.id, g.display_name_en]));

  return paidSessions.map((s) => {
    const station = stationMap.get(s.station_id);
    return {
      sessionId: s.id,
      stationId: s.station_id,
      stationCode: station?.code ?? '—',
      stationDisplayName: station?.display_name ?? '—',
      customerName: (s.customer_id ? profileMap.get(s.customer_id) : null) ?? s.customer_label ?? null,
      gameTypeName: station ? (gameTypeMap.get(station.game_type_id) ?? '—') : '—',
      addedAt: s.created_at,
    };
  });
}

/**
 * The ONLY place the clock actually starts. Moves a paid, not-yet-started
 * session from 'pending' to 'active' — recomputing started_at/ends_at from
 * THIS moment (the trigger that auto-computes ends_at only runs on INSERT,
 * so it never saw the real start time; we set both explicitly here). Purely
 * operational: payment/invoice/points already happened at settlement, this
 * touches none of that.
 */
export async function startPendingSession({
  sessionId,
  tenantId,
  branchId,
  actorId,
}: {
  sessionId: string;
  tenantId: string;
  branchId: string;
  actorId: string;
}): Promise<{ ok: boolean }> {
  const admin = createAdminClient();

  const { data: session, error } = await admin
    .from('sessions')
    .select('id, station_id, status, planned_duration_seconds')
    .eq('id', sessionId)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  if (error || !session) throw error ?? new Error('Session not found');
  if (session.status !== 'pending') throw new Error('session_not_pending');

  const startedAt = new Date();
  const endsAt = session.planned_duration_seconds
    ? new Date(startedAt.getTime() + session.planned_duration_seconds * 1000)
    : null;

  const { error: updateError } = await admin
    .from('sessions')
    .update({
      status: 'active',
      started_at: startedAt.toISOString(),
      ends_at: endsAt ? endsAt.toISOString() : null,
    } as never)
    .eq('id', sessionId);
  if (updateError) throw updateError;

  const { data: station } = await admin.from('stations').select('code, game_type_id').eq('id', session.station_id).maybeSingle();

  await admin.from('activity_log').insert({
    tenant_id: tenantId,
    branch_id: branchId,
    actor_id: actorId,
    actor_role: 'staff',
    action: 'session.started',
    entity_type: 'session',
    entity_id: sessionId,
    after: { started_at: startedAt.toISOString(), ends_at: endsAt?.toISOString() ?? null },
  });

  if (station) {
    void fireStartLightSequence(station.code, station.game_type_id, branchId);
  }

  return { ok: true };
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
