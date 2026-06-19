import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { creditWallet, debitWallet } from '@/lib/wallet';
import { computeSessionPrice } from '@/lib/cashier';
import { runLightSequence } from '@/lib/ifttt';
import { resolveOfferForCheckout, recordOfferRedemption, type ResolveOfferResult } from '@/lib/offers';

const DEFAULT_NOTIFICATION_WINDOW_MINUTES = 10;
const DEFAULT_CANCELLATION_CREDIT_PERCENT = 100;

/**
 * Get the next ticket number for a branch+game type for today.
 * Numbering restarts daily (max existing ticket_number for today + 1, starting at 1).
 */
async function getNextTicketNumber(branchId: string, gameTypeId: string): Promise<number> {
  const admin = createAdminClient();

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const { data, error } = await admin
    .from('queue_tickets')
    .select('ticket_number')
    .eq('branch_id', branchId)
    .eq('game_type_id', gameTypeId)
    .gte('created_at', startOfDay.toISOString())
    .order('ticket_number', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return (data?.ticket_number ?? 0) + 1;
}

export interface JoinQueueArgs {
  tenantId: string;
  branchId: string;
  gameTypeId: string;
  customerId: string;
  playerCount: number;
  durationMinutes: number;
  offerCode?: string;
}

export interface JoinQueueResult {
  ticketId: string;
  ticketNumber: number;
  paidCents: number;
  basePriceCents: number;
  balanceCents: number;
  appliedOffer?: {
    nameEn: string;
    nameAr: string;
    discountType: string;
    discountCents: number;
    freeMinutes: number;
    doublePoints: boolean;
  };
  offerNotAppliedReason?: string;
}

/**
 * Customer joins the queue for a game type — pays the full session price
 * from their wallet upfront. The held payment is linked to the resulting
 * session once staff seats them (seatTicket), so they aren't charged again.
 */
export async function joinQueue({
  tenantId,
  branchId,
  gameTypeId,
  customerId,
  playerCount,
  durationMinutes,
  offerCode,
}: JoinQueueArgs): Promise<JoinQueueResult> {
  const admin = createAdminClient();

  const basePriceCents = await computeSessionPrice({ gameTypeId, durationMinutes, branchId });

  // Resolve offer (code takes precedence over auto; invalid code → full price)
  const offerResult: ResolveOfferResult = await resolveOfferForCheckout({
    tenantId,
    customerId,
    gameTypeId,
    amountCents: basePriceCents,
    code: offerCode,
  });
  const chargedCents = offerResult.finalAmountCents;

  // Wallet debit is atomic (RPC) and validated first so we don't record a
  // payment/ticket if the customer can't actually cover the charge.
  let balanceCents: number;
  try {
    const debit = await debitWallet({
      tenantId,
      customerId,
      amountCents: chargedCents,
      kind: 'debit_queue',
      reason: 'Queue ticket',
      referenceType: 'queue_ticket',
      createdBy: customerId,
    });
    balanceCents = debit.balanceCents;
  } catch (e) {
    if (e instanceof Error && e.message.includes('insufficient_funds')) {
      throw new Error('insufficient_funds');
    }
    throw e;
  }

  const { data: payment, error: paymentError } = await admin
    .from('payments')
    .insert({
      tenant_id: tenantId,
      branch_id: branchId,
      customer_id: customerId,
      purpose: 'queue_hold',
      amount_cents: chargedCents,
      currency: 'SAR',
      provider: 'manual',
      method: 'wallet',
      status: 'captured',
      captured_at: new Date().toISOString(),
      initiated_by: customerId,
    })
    .select('id')
    .single();

  if (paymentError || !payment) throw paymentError ?? new Error('Failed to record payment');

  const ticketNumber = await getNextTicketNumber(branchId, gameTypeId);

  const { data: ticket, error: ticketError } = await admin
    .from('queue_tickets')
    .insert({
      tenant_id: tenantId,
      branch_id: branchId,
      game_type_id: gameTypeId,
      customer_id: customerId,
      player_count: playerCount,
      ticket_number: ticketNumber,
      status: 'waiting',
      held_payment_id: payment.id,
      paid_amount_cents: chargedCents,
      paid_from: 'wallet',
    })
    .select('id')
    .single();

  if (ticketError || !ticket) throw ticketError ?? new Error('Failed to create queue ticket');

  await admin.from('activity_log').insert({
    tenant_id: tenantId,
    branch_id: branchId,
    actor_id: customerId,
    actor_role: 'customer',
    action: 'queue.joined',
    entity_type: 'queue_ticket',
    entity_id: ticket.id,
    after: { ticket_number: ticketNumber, paid_amount_cents: chargedCents },
  });

  // Record offer redemption after ticket is confirmed
  if (offerResult.applied && offerResult.offer) {
    // TODO(double_points): apply 2× loyalty multiplier when points are calculated for this session.
    // TODO(free_minutes_queue): extra minutes from the offer apply when staff seats this ticket;
    // seatTicket() should add offerResult.freeMinutes to planned_duration_seconds at that point.
    await recordOfferRedemption({
      tenantId,
      offerId: offerResult.offer.id,
      customerId,
      discountCents: offerResult.discountCents,
    });
  }

  return {
    ticketId: ticket.id,
    ticketNumber,
    paidCents: chargedCents,
    basePriceCents,
    balanceCents,
    appliedOffer: offerResult.applied && offerResult.offer
      ? {
          nameEn: offerResult.offer.nameEn,
          nameAr: offerResult.offer.nameAr,
          discountType: offerResult.offer.discountType,
          discountCents: offerResult.discountCents,
          freeMinutes: offerResult.freeMinutes,
          doublePoints: offerResult.doublePoints,
        }
      : undefined,
    offerNotAppliedReason: !offerResult.applied && offerCode ? offerResult.reason : undefined,
  };
}

export interface CallNextTicketArgs {
  tenantId: string;
  branchId: string;
  gameTypeId: string;
  actorId: string;
}

export interface CallNextTicketResult {
  ticketId: string;
  ticketNumber: number;
  customerId: string | null;
  notificationExpiresAt: string;
}

/**
 * Staff calls the next waiting ticket for a game type (lowest ticket number,
 * VIP tickets first). Returns null if the queue for this game type is empty.
 */
export async function callNextTicket({
  tenantId,
  branchId,
  gameTypeId,
  actorId,
}: CallNextTicketArgs): Promise<CallNextTicketResult | null> {
  const admin = createAdminClient();

  const { data: ticket, error: ticketError } = await admin
    .from('queue_tickets')
    .select('id, ticket_number, customer_id')
    .eq('branch_id', branchId)
    .eq('game_type_id', gameTypeId)
    .eq('status', 'waiting')
    .order('is_vip', { ascending: false })
    .order('ticket_number', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (ticketError) throw ticketError;
  if (!ticket) return null;

  const { data: branch } = await admin
    .from('branches')
    .select('queue_policy')
    .eq('id', branchId)
    .maybeSingle();

  const policy = (branch?.queue_policy ?? {}) as Record<string, unknown>;
  const windowMinutes =
    typeof policy.notification_window_minutes === 'number'
      ? policy.notification_window_minutes
      : DEFAULT_NOTIFICATION_WINDOW_MINUTES;

  const notificationExpiresAt = new Date(Date.now() + windowMinutes * 60_000).toISOString();

  const { error: updateError } = await admin
    .from('queue_tickets')
    .update({
      status: 'called',
      called_at: new Date().toISOString(),
      notification_expires_at: notificationExpiresAt,
    })
    .eq('id', ticket.id);

  if (updateError) throw updateError;

  await admin.from('activity_log').insert({
    tenant_id: tenantId,
    branch_id: branchId,
    actor_id: actorId,
    actor_role: 'staff',
    action: 'queue.called',
    entity_type: 'queue_ticket',
    entity_id: ticket.id,
    after: { ticket_number: ticket.ticket_number, notification_expires_at: notificationExpiresAt },
  });

  // TODO(Phase 4): trigger a WhatsApp "your table is ready" notification to
  // ticket.customer_id here, using notificationExpiresAt as the deadline.

  return {
    ticketId: ticket.id,
    ticketNumber: ticket.ticket_number,
    customerId: ticket.customer_id,
    notificationExpiresAt,
  };
}

export interface SeatTicketArgs {
  tenantId: string;
  branchId: string;
  ticketId: string;
  stationId: string;
  durationMinutes: number;
  actorId: string;
}

export interface SeatTicketResult {
  sessionId: string;
  ticketNumber: number;
}

/**
 * Staff seats a called (or waiting, if staff skips the call step) ticket onto
 * a free station, starting the session. The session was already paid for via
 * the ticket's held queue_hold payment — no second charge is made.
 */
export async function seatTicket({
  tenantId,
  branchId,
  ticketId,
  stationId,
  durationMinutes,
  actorId,
}: SeatTicketArgs): Promise<SeatTicketResult> {
  const admin = createAdminClient();

  const { data: ticket, error: ticketError } = await admin
    .from('queue_tickets')
    .select('id, ticket_number, status, customer_id, customer_label, player_count, held_payment_id')
    .eq('id', ticketId)
    .maybeSingle();

  if (ticketError || !ticket) throw new Error('Queue ticket not found');
  if (ticket.status !== 'called' && ticket.status !== 'waiting') {
    throw new Error('Ticket is not waiting or called');
  }

  const { data: station, error: stationError } = await admin
    .from('stations')
    .select('id, branch_id, status, game_type_id, code')
    .eq('id', stationId)
    .maybeSingle();

  if (stationError || !station) throw new Error('Station not found');
  if (station.branch_id !== branchId) throw new Error('Station does not belong to this branch');
  if (station.status !== 'available') throw new Error('Station is not available');

  const { data: gameType, error: gameTypeError } = await admin
    .from('game_types')
    .select('category')
    .eq('id', station.game_type_id)
    .maybeSingle();

  if (gameTypeError || !gameType) throw new Error('Game type not found');

  const { data: session, error: sessionError } = await admin
    .from('sessions')
    .insert({
      tenant_id: tenantId,
      branch_id: branchId,
      station_id: stationId,
      customer_id: ticket.customer_id,
      customer_label: ticket.customer_label,
      player_count: ticket.player_count,
      duration_mode: 'custom',
      planned_duration_seconds: durationMinutes * 60,
      status: 'active',
      booking_id: null,
    })
    .select('id')
    .single();

  if (sessionError || !session) throw sessionError ?? new Error('Failed to create session');

  // Link the held queue_hold payment to this session — no second charge.
  if (ticket.held_payment_id) {
    await admin.from('payments').update({ session_id: session.id }).eq('id', ticket.held_payment_id);
  }

  const { error: updateError } = await admin
    .from('queue_tickets')
    .update({
      status: 'seated',
      seated_at: new Date().toISOString(),
      seated_session_id: session.id,
    })
    .eq('id', ticketId);

  if (updateError) throw updateError;

  await admin.from('activity_log').insert({
    tenant_id: tenantId,
    branch_id: branchId,
    actor_id: actorId,
    actor_role: 'staff',
    action: 'queue.seated',
    entity_type: 'queue_ticket',
    entity_id: ticketId,
    after: { ticket_number: ticket.ticket_number, station_id: stationId, session_id: session.id },
  });

  void fireStartLightSequence(station.code, gameType.category, branchId);

  return { sessionId: session.id, ticketNumber: ticket.ticket_number };
}

export interface CancelTicketArgs {
  tenantId: string;
  ticketId: string;
  actorId: string;
  byStaff: boolean;
}

export interface CancelTicketResult {
  creditedCents: number;
  balanceCents: number;
}

/**
 * Cancel a waiting or called ticket and convert its held payment to wallet
 * store credit (per the branch's cancellation_credit_percent policy).
 */
export async function cancelTicket({
  tenantId,
  ticketId,
  actorId,
  byStaff,
}: CancelTicketArgs): Promise<CancelTicketResult> {
  const admin = createAdminClient();

  const { data: ticket, error: ticketError } = await admin
    .from('queue_tickets')
    .select('id, branch_id, customer_id, ticket_number, status, paid_amount_cents')
    .eq('id', ticketId)
    .maybeSingle();

  if (ticketError || !ticket) throw new Error('Queue ticket not found');
  if (ticket.status !== 'waiting' && ticket.status !== 'called') {
    throw new Error('Ticket cannot be cancelled');
  }
  if (!ticket.customer_id) throw new Error('Ticket has no customer to credit');

  const { data: branch } = await admin
    .from('branches')
    .select('queue_policy')
    .eq('id', ticket.branch_id)
    .maybeSingle();

  const policy = (branch?.queue_policy ?? {}) as Record<string, unknown>;
  const creditPercent =
    typeof policy.cancellation_credit_percent === 'number'
      ? policy.cancellation_credit_percent
      : DEFAULT_CANCELLATION_CREDIT_PERCENT;

  const creditedCents = Math.round((ticket.paid_amount_cents * creditPercent) / 100);

  const credit = await creditWallet({
    tenantId,
    customerId: ticket.customer_id,
    amountCents: creditedCents,
    kind: 'credit_cancellation',
    reason: 'Queue ticket cancelled',
    referenceType: 'queue_ticket',
    referenceId: ticketId,
    createdBy: actorId,
  });

  const { error: updateError } = await admin
    .from('queue_tickets')
    .update({
      status: 'cancelled',
      wallet_credit_ledger_id: credit.ledgerId,
    })
    .eq('id', ticketId);

  if (updateError) throw updateError;

  await admin.from('activity_log').insert({
    tenant_id: tenantId,
    branch_id: ticket.branch_id,
    actor_id: actorId,
    actor_role: byStaff ? 'staff' : 'customer',
    action: 'queue.cancelled',
    entity_type: 'queue_ticket',
    entity_id: ticketId,
    after: { credited_cents: creditedCents },
  });

  return { creditedCents, balanceCents: credit.balanceCents };
}

export interface ExpireTicketArgs {
  tenantId: string;
  ticketId: string;
  actorId: string;
}

/**
 * Mark a called ticket as a no-show once its notification window has
 * expired. The held payment is forfeited — no wallet credit is issued.
 */
export async function expireTicket({ tenantId, ticketId, actorId }: ExpireTicketArgs): Promise<{ ok: boolean }> {
  const admin = createAdminClient();

  const { data: ticket, error: ticketError } = await admin
    .from('queue_tickets')
    .select('id, branch_id, ticket_number, status, notification_expires_at, paid_amount_cents')
    .eq('id', ticketId)
    .maybeSingle();

  if (ticketError || !ticket) throw new Error('Queue ticket not found');
  if (ticket.status !== 'called') throw new Error('Ticket is not in called status');
  if (!ticket.notification_expires_at || new Date(ticket.notification_expires_at) > new Date()) {
    throw new Error('Notification window has not expired yet');
  }

  const { error: updateError } = await admin
    .from('queue_tickets')
    .update({ status: 'expired', expired_at: new Date().toISOString() })
    .eq('id', ticketId);

  if (updateError) throw updateError;

  await admin.from('activity_log').insert({
    tenant_id: tenantId,
    branch_id: ticket.branch_id,
    actor_id: actorId,
    actor_role: 'staff',
    action: 'queue.expired',
    entity_type: 'queue_ticket',
    entity_id: ticketId,
    after: { forfeited_cents: ticket.paid_amount_cents },
  });

  return { ok: true };
}

export interface CustomerQueueTicket {
  ticketId: string;
  ticketNumber: number;
  gameTypeId: string;
  gameTypeName: string;
  gameTypeNameAr: string;
  status: string;
  positionAhead: number;
  notificationExpiresAt: string | null;
  paidCents: number;
}

/**
 * Read a customer's active (waiting or called) queue tickets, each with its
 * live position in the queue (count of tickets ahead, accounting for VIP).
 */
export async function getCustomerQueueTickets(tenantId: string, customerId: string): Promise<CustomerQueueTicket[]> {
  const admin = createAdminClient();

  const { data: tickets, error } = await admin
    .from('queue_tickets')
    .select('id, branch_id, game_type_id, ticket_number, is_vip, status, notification_expires_at, paid_amount_cents')
    .eq('tenant_id', tenantId)
    .eq('customer_id', customerId)
    .in('status', ['waiting', 'called'])
    .order('created_at', { ascending: true });

  if (error) throw error;
  if (!tickets || tickets.length === 0) return [];

  const gameTypeIds = Array.from(new Set(tickets.map((t) => t.game_type_id)));
  const { data: gameTypes } = await admin.from('game_types').select('id, display_name_en, display_name_ar').in('id', gameTypeIds);
  const gameTypeNames = new Map((gameTypes ?? []).map((g) => [g.id, g.display_name_en]));
  const gameTypeNamesAr = new Map((gameTypes ?? []).map((g) => [g.id, g.display_name_ar ?? g.display_name_en]));

  const results: CustomerQueueTicket[] = [];
  for (const ticket of tickets) {
    let positionAhead = 0;

    if (ticket.status === 'waiting') {
      if (!ticket.is_vip) {
        const { count: vipAhead } = await admin
          .from('queue_tickets')
          .select('id', { count: 'exact', head: true })
          .eq('branch_id', ticket.branch_id)
          .eq('game_type_id', ticket.game_type_id)
          .eq('status', 'waiting')
          .eq('is_vip', true);
        positionAhead += vipAhead ?? 0;
      }

      const { count: sameTierAhead } = await admin
        .from('queue_tickets')
        .select('id', { count: 'exact', head: true })
        .eq('branch_id', ticket.branch_id)
        .eq('game_type_id', ticket.game_type_id)
        .eq('status', 'waiting')
        .eq('is_vip', ticket.is_vip)
        .lt('ticket_number', ticket.ticket_number);
      positionAhead += sameTierAhead ?? 0;
    }

    results.push({
      ticketId: ticket.id,
      ticketNumber: ticket.ticket_number,
      gameTypeId: ticket.game_type_id,
      gameTypeName: gameTypeNames.get(ticket.game_type_id) ?? '',
      gameTypeNameAr: gameTypeNamesAr.get(ticket.game_type_id) ?? '',
      status: ticket.status,
      positionAhead,
      notificationExpiresAt: ticket.notification_expires_at,
      paidCents: ticket.paid_amount_cents,
    });
  }

  return results;
}

export interface QueueableGameType {
  id: string;
  code: string;
  displayNameEn: string;
  displayNameAr: string;
  icon: string | null;
  minPlayers: number;
  maxPlayers: number;
  supportsPlayerCount: boolean;
  defaultDurationMin: number | null;
}

/** Active game types a customer can join a queue for, ordered for display. */
export async function getQueueableGameTypes(tenantId: string): Promise<QueueableGameType[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('game_types')
    .select('id, code, display_name_en, display_name_ar, icon, min_players, max_players, supports_player_count, default_duration_min, sort_order')
    .eq('tenant_id', tenantId)
    .eq('is_active', true)
    .order('sort_order', { ascending: true });

  if (error) throw error;
  return (data ?? []).map((g) => ({
    id: g.id,
    code: g.code,
    displayNameEn: g.display_name_en,
    displayNameAr: g.display_name_ar ?? g.display_name_en,
    icon: g.icon,
    minPlayers: g.min_players ?? 1,
    maxPlayers: g.max_players ?? 1,
    supportsPlayerCount: g.supports_player_count,
    defaultDurationMin: g.default_duration_min,
  }));
}

export interface StaffQueueTicket {
  ticketId: string;
  ticketNumber: number;
  status: 'waiting' | 'called';
  customerName: string | null;
  playerCount: number;
  isVip: boolean;
  waitingMinutes: number;
  notificationExpiresAt: string | null;
  paidCents: number;
}

export interface StaffQueueGroup {
  gameTypeId: string;
  gameTypeCode: string;
  gameTypeName: string;
  gameTypeNameAr: string;
  icon: string | null;
  tickets: StaffQueueTicket[];
}

/**
 * All waiting + called tickets for a branch, grouped by game type and ordered
 * for the staff queue panel (VIP first, then lowest ticket number).
 */
export async function getBranchQueueOverview(tenantId: string, branchId: string): Promise<StaffQueueGroup[]> {
  const admin = createAdminClient();

  const [{ data: tickets, error: ticketsError }, { data: gameTypes, error: gameTypesError }] = await Promise.all([
    admin
      .from('queue_tickets')
      .select(
        'id, game_type_id, ticket_number, status, customer_id, customer_label, player_count, is_vip, notification_expires_at, paid_amount_cents, created_at'
      )
      .eq('tenant_id', tenantId)
      .eq('branch_id', branchId)
      .in('status', ['waiting', 'called'])
      .order('is_vip', { ascending: false })
      .order('ticket_number', { ascending: true }),
    admin
      .from('game_types')
      .select('id, code, display_name_en, display_name_ar, icon, sort_order')
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .order('sort_order', { ascending: true }),
  ]);

  if (ticketsError) throw ticketsError;
  if (gameTypesError) throw gameTypesError;

  const customerIds = Array.from(
    new Set((tickets ?? []).map((t) => t.customer_id).filter((id): id is string => !!id))
  );
  const { data: profiles } = customerIds.length
    ? await admin.from('profiles').select('id, full_name, phone').in('id', customerIds)
    : { data: [] };
  const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));

  const groups = new Map<string, StaffQueueGroup>();
  for (const gt of gameTypes ?? []) {
    groups.set(gt.id, { gameTypeId: gt.id, gameTypeCode: gt.code, gameTypeName: gt.display_name_en, gameTypeNameAr: gt.display_name_ar ?? gt.display_name_en, icon: gt.icon, tickets: [] });
  }

  const now = Date.now();
  for (const t of tickets ?? []) {
    const group = groups.get(t.game_type_id);
    if (!group) continue;
    const profile = t.customer_id ? profileById.get(t.customer_id) : null;
    group.tickets.push({
      ticketId: t.id,
      ticketNumber: t.ticket_number,
      status: t.status as 'waiting' | 'called',
      customerName: t.customer_label ?? profile?.full_name ?? profile?.phone ?? null,
      playerCount: t.player_count,
      isVip: t.is_vip,
      waitingMinutes: Math.floor((now - new Date(t.created_at).getTime()) / 60_000),
      notificationExpiresAt: t.notification_expires_at,
      paidCents: t.paid_amount_cents,
    });
  }

  return Array.from(groups.values());
}

/** Fire-and-forget: runs the START smart-light sequence for a station, if the branch has IFTTT configured. */
async function fireStartLightSequence(
  stationCode: string,
  gameCategory: 'billiard' | 'bowling' | 'ping_pong' | 'karaoke' | 'foosball' | 'ps5' | 'vr' | 'arcade' | 'other',
  branchId: string
): Promise<void> {
  const admin = createAdminClient();

  const { data: branch } = await admin.from('branches').select('ifttt_webhook_key').eq('id', branchId).maybeSingle();
  if (!branch?.ifttt_webhook_key) return;

  void runLightSequence({ code: stationCode, gameCategory }, 'START', branch.ifttt_webhook_key);
}
