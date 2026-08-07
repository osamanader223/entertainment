import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { debitWallet, creditWallet } from '@/lib/wallet';
import { computeSessionPrice } from '@/lib/cashier';
import { runLightSequence } from '@/lib/ifttt';
import { resolveOfferForCheckout, recordOfferRedemption } from '@/lib/offers';
import { awardPoints, computePointsEarned } from '@/lib/loyalty';
import { fireNotification } from '@/lib/notifications';
import { isStationFreeForWindow } from '@/lib/station-overlap';
import { issueInvoiceForPayment } from '@/lib/invoices';
import { computeBowlingDuration } from '@/lib/bowling';
import {
  generateSlotsForVenueDay,
  computeSlotAvailability,
  getVenueDayWindow,
  resolveVenueDateForInstant,
  isValidSlotBoundary,
  type SlotAvailability,
  type BusyWindow,
} from '@/lib/slots';
import type { Database } from '@/types/database';

const NO_SHOW_CUTOFF_MINUTES = 10;

export { isStationFreeForWindow };

type GameCategory = Database['public']['Enums']['game_category'];

export interface CreateCustomerBookingArgs {
  tenantId: string;
  branchId: string;
  stationId: string;
  customerId: string;
  durationMinutes: number;
  paymentMethod: 'wallet';
  offerCode?: string;
}

export interface AppliedOfferInfo {
  nameEn: string;
  nameAr: string;
  discountType: string;
  discountCents: number;
  freeMinutes: number;
  doublePoints: boolean;
}

export interface CreateCustomerBookingResult {
  sessionId: string;
  paymentId: string;
  amountCents: number;
  chargedCents: number;
  balanceCents: number;
  referenceCode: string;
  appliedOffer?: AppliedOfferInfo;
  offerNotAppliedReason?: string;
  pointsAwarded: number;
  tierUp: boolean;
  newTier: string;
}

/**
 * @deprecated The customer-facing UI now only books via slots
 * (createScheduledBooking) — /dashboard/book no longer offers an instant
 * path. Kept for the cashier/API surface in case something still calls it;
 * not wired into any current UI. Do not delete without checking callers.
 *
 * Customer self-service version of startCashierSession: validates the
 * station is free, charges the customer's wallet, opens the session, and
 * records a booking row. The sync_station_status trigger flips the station
 * to 'occupied' once the session row is inserted.
 */
export async function createCustomerBooking({
  tenantId,
  branchId,
  stationId,
  customerId,
  durationMinutes,
  offerCode,
}: CreateCustomerBookingArgs): Promise<CreateCustomerBookingResult> {
  const admin = createAdminClient();

  const { data: station, error: stationError } = await admin
    .from('stations')
    .select('id, branch_id, status, game_type_id, display_name, code')
    .eq('id', stationId)
    .maybeSingle();

  if (stationError || !station) throw new Error('Station not found');
  if (station.branch_id !== branchId) throw new Error('Station does not belong to this branch');
  if (station.status !== 'available') throw new Error('Station is not available');

  // A near-future reservation doesn't flip station.status until its session
  // actually starts, so an instant booking could otherwise walk right into it.
  const instantNow = new Date();
  const instantWindowEnd = new Date(instantNow.getTime() + durationMinutes * 60_000);
  if (!(await isStationFreeForWindow(stationId, instantNow.toISOString(), instantWindowEnd.toISOString()))) {
    throw new Error('station_reserved');
  }

  const { data: gameType, error: gameTypeError } = await admin
    .from('game_types')
    .select('category')
    .eq('id', station.game_type_id)
    .maybeSingle();

  if (gameTypeError || !gameType) throw new Error('Game type not found');

  const amountCents = await computeSessionPrice({
    gameTypeId: station.game_type_id,
    durationMinutes,
    branchId,
  });

  // Resolve offer (code takes precedence over auto; invalid code → full price)
  const offerResult = await resolveOfferForCheckout({
    tenantId,
    customerId,
    gameTypeId: station.game_type_id,
    amountCents,
    code: offerCode,
  });
  const chargedCents = offerResult.finalAmountCents;
  const extraSeconds = offerResult.freeMinutes * 60;

  // Wallet debit is atomic (RPC) and validated first so we don't record a
  // booking/payment/session if the customer can't cover the charge.
  let balanceCents: number;
  try {
    const debit = await debitWallet({
      tenantId,
      customerId,
      amountCents: chargedCents,
      kind: 'debit_booking',
      reason: `Booking — ${station.display_name}`,
      referenceType: 'session',
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
      purpose: 'session',
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

  const { data: session, error: sessionError } = await admin
    .from('sessions')
    .insert({
      tenant_id: tenantId,
      branch_id: branchId,
      station_id: stationId,
      customer_id: customerId,
      duration_mode: 'custom',
      // free_minutes offer: add bonus seconds on top of the booked duration
      planned_duration_seconds: durationMinutes * 60 + extraSeconds,
      status: 'active',
      player_count: 1,
    })
    .select('id')
    .single();

  if (sessionError || !session) throw sessionError ?? new Error('Failed to create session');

  const { data: booking, error: bookingError } = await admin
    .from('bookings')
    .insert({
      tenant_id: tenantId,
      branch_id: branchId,
      customer_id: customerId,
      game_type_id: station.game_type_id,
      station_id: stationId,
      duration_mode: 'custom',
      duration_minutes: durationMinutes,
      scheduled_start_at: new Date().toISOString(),
      status: 'in_session',
      source: 'app',
      wallet_paid_cents: chargedCents,
    })
    .select('id, reference_code')
    .single();

  if (bookingError || !booking) throw bookingError ?? new Error('Failed to create booking');

  await admin.from('sessions').update({ booking_id: booking.id }).eq('id', session.id);

  await admin.from('activity_log').insert({
    tenant_id: tenantId,
    branch_id: branchId,
    actor_id: customerId,
    actor_role: 'customer',
    action: 'session.started_by_customer',
    entity_type: 'session',
    entity_id: session.id,
    after: { station_id: stationId, booking_id: booking.id, amount_cents: chargedCents },
  });

  // ZATCA Phase 1: every paid transaction gets an invoice. Awaited, not
  // fire-and-forget — but its failure must not undo an already-paid,
  // already-active session. Logged loudly instead; /admin/invoices lists
  // uninvoiced captured payments for exactly this case.
  try {
    await issueInvoiceForPayment({ tenantId, branchId, paymentId: payment.id, sessionId: session.id, issuedBy: customerId });
  } catch (invoiceError) {
    console.error('[invoices] CRITICAL: failed to issue invoice for instant-booking payment', payment.id, invoiceError);
  }

  // Record offer redemption after booking is confirmed
  if (offerResult.applied && offerResult.offer) {
    await recordOfferRedemption({
      tenantId,
      offerId: offerResult.offer.id,
      customerId,
      bookingId: booking.id,
      sessionId: session.id,
      discountCents: offerResult.discountCents,
    });
  }

  // Points are earned on the PAID amount (after discount) — only double_points doubles it.
  const points = computePointsEarned(chargedCents, offerResult.doublePoints);
  const award = await awardPoints({
    tenantId,
    customerId,
    points,
    reason: 'booking_completed',
    referenceType: 'session',
    referenceId: session.id,
    actorId: customerId,
  });

  void fireStartLightSequence(station.code, gameType.category, branchId);
  void fireBookingConfirmedNotification({ tenantId, customerId, bookingId: booking.id, station, durationMinutes, referenceCode: booking.reference_code });

  return {
    sessionId: session.id,
    paymentId: payment.id,
    amountCents,
    chargedCents,
    balanceCents,
    referenceCode: booking.reference_code,
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
    pointsAwarded: award.pointsAwarded,
    tierUp: award.tierUp,
    newTier: award.newTier,
  };
}

/** Fire-and-forget: runs the START smart-light sequence for a station, if the branch has IFTTT configured. */
async function fireStartLightSequence(
  stationCode: string,
  gameCategory: GameCategory,
  branchId: string
): Promise<void> {
  const admin = createAdminClient();

  const { data: branch } = await admin.from('branches').select('ifttt_webhook_key').eq('id', branchId).maybeSingle();
  if (!branch?.ifttt_webhook_key) return;

  void runLightSequence({ code: stationCode, gameCategory }, 'START', branch.ifttt_webhook_key);
}

/** Fire-and-forget: WhatsApp booking-confirmed notification. */
async function fireBookingConfirmedNotification(input: {
  tenantId: string;
  customerId: string;
  bookingId: string;
  station: { display_name: string };
  durationMinutes: number;
  referenceCode: string;
}): Promise<void> {
  try {
    fireNotification({
      tenantId: input.tenantId,
      customerId: input.customerId,
      templateCode: 'booking_confirmed',
      params: {
        stationName: input.station.display_name,
        startTime: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
        durationMinutes: String(input.durationMinutes),
        referenceCode: input.referenceCode,
      },
      referenceType: 'booking',
      referenceId: input.bookingId,
    });
  } catch (err) {
    console.error('[booking] fireBookingConfirmedNotification failed', err);
  }
}

// =====================================================================
// SCHEDULED BOOKINGS — reserve a station for a future date/time.
// =====================================================================

export interface CreateScheduledBookingArgs {
  tenantId: string;
  branchId: string;
  stationId: string;
  customerId: string;
  scheduledStartAt: string; // ISO datetime
  durationMinutes: number;
  offerCode?: string;
  /** Bowling only — durationMinutes above must already be computeBowlingDuration()'s result. */
  playerCount?: number;
  gameCount?: number;
}

export interface CreateScheduledBookingResult {
  bookingId: string;
  referenceCode: string;
  amountCents: number;
  chargedCents: number;
  balanceCents: number;
  scheduledStartAt: string;
  scheduledEndAt: string;
  appliedOffer?: AppliedOfferInfo;
  offerNotAppliedReason?: string;
}

/**
 * Reserve a station for a future window. Paid upfront from wallet, same as
 * instant booking — but the session (and loyalty points) don't start until
 * check-in/auto-start actually happens (startScheduledBookingSession).
 */
export async function createScheduledBooking({
  tenantId,
  branchId,
  stationId,
  customerId,
  scheduledStartAt,
  durationMinutes,
  offerCode,
  playerCount,
  gameCount,
}: CreateScheduledBookingArgs): Promise<CreateScheduledBookingResult> {
  const admin = createAdminClient();

  const startDate = new Date(scheduledStartAt);
  if (Number.isNaN(startDate.getTime())) throw new Error('invalid_datetime');
  if (startDate.getTime() <= Date.now()) throw new Error('must_be_future');
  const endDate = new Date(startDate.getTime() + durationMinutes * 60_000);

  const { data: station, error: stationError } = await admin
    .from('stations')
    .select('id, branch_id, game_type_id, display_name, code, is_active')
    .eq('id', stationId)
    .maybeSingle();
  if (stationError || !station) throw new Error('Station not found');
  if (station.branch_id !== branchId) throw new Error('Station does not belong to this branch');
  if (!station.is_active) throw new Error('Station is not active');

  const { data: gameType, error: gameTypeError } = await admin
    .from('game_types')
    .select('category')
    .eq('id', station.game_type_id)
    .maybeSingle();
  if (gameTypeError || !gameType) throw new Error('Game type not found');

  // Slot-grid alignment: must land on a :00/:30 boundary within the venue's
  // open hours, and must not run past closing. Re-derived server-side from
  // branch hours rather than trusted from the client.
  const [{ data: branch, error: branchError }, { data: tenant, error: tenantError }] = await Promise.all([
    admin.from('branches').select('opens_at, closes_at').eq('id', branchId).maybeSingle(),
    admin.from('tenants').select('timezone').eq('id', tenantId).maybeSingle(),
  ]);
  if (branchError || !branch) throw new Error('Branch not found');
  if (tenantError || !tenant) throw new Error('Tenant not found');

  const venueDate = resolveVenueDateForInstant(startDate.toISOString(), branch.opens_at, branch.closes_at, tenant.timezone);
  const { openISO, closeISO } = getVenueDayWindow(venueDate, branch.opens_at, branch.closes_at, tenant.timezone);
  if (!isValidSlotBoundary(startDate.toISOString(), tenant.timezone) || startDate.getTime() < new Date(openISO).getTime()) {
    throw new Error('invalid_slot');
  }
  if (endDate.getTime() > new Date(closeISO).getTime()) {
    throw new Error('exceeds_closing');
  }

  // OVERLAP CHECK — before charging anything.
  const isFree = await isStationFreeForWindow(stationId, startDate.toISOString(), endDate.toISOString());
  if (!isFree) throw new Error('slot_unavailable');

  const amountCents = await computeSessionPrice({ gameTypeId: station.game_type_id, durationMinutes, branchId, playerCount, gameCount });

  const offerResult = await resolveOfferForCheckout({
    tenantId,
    customerId,
    gameTypeId: station.game_type_id,
    amountCents,
    code: offerCode,
  });
  const chargedCents = offerResult.finalAmountCents;

  let balanceCents: number;
  try {
    const debit = await debitWallet({
      tenantId,
      customerId,
      amountCents: chargedCents,
      kind: 'debit_booking',
      reason: `Reservation — ${station.display_name}`,
      referenceType: 'booking',
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
      purpose: 'session',
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

  const { data: booking, error: bookingError } = await admin
    .from('bookings')
    .insert({
      tenant_id: tenantId,
      branch_id: branchId,
      customer_id: customerId,
      game_type_id: station.game_type_id,
      station_id: stationId,
      duration_mode: 'custom',
      duration_minutes: durationMinutes,
      player_count: playerCount ?? 1,
      game_count: gameCount ?? null,
      scheduled_start_at: startDate.toISOString(),
      scheduled_end_at: endDate.toISOString(),
      status: 'confirmed',
      booking_mode: 'scheduled',
      source: 'app',
      wallet_paid_cents: chargedCents,
      held_payment_id: payment.id,
    } as never)
    .select('id, reference_code')
    .single();
  if (bookingError || !booking) throw bookingError ?? new Error('Failed to create booking');

  if (offerResult.applied && offerResult.offer) {
    await recordOfferRedemption({
      tenantId,
      offerId: offerResult.offer.id,
      customerId,
      bookingId: booking.id,
      discountCents: offerResult.discountCents,
    });
  }

  await admin.from('activity_log').insert({
    tenant_id: tenantId,
    branch_id: branchId,
    actor_id: customerId,
    actor_role: 'customer',
    action: 'booking.scheduled',
    entity_type: 'booking',
    entity_id: booking.id,
    after: { station_id: stationId, scheduled_start_at: startDate.toISOString(), amount_cents: chargedCents },
  });

  // ZATCA Phase 1: payment is captured up-front for a scheduled booking
  // (the session itself doesn't exist until check-in), so the invoice is
  // issued now, against the payment — not deferred to session start.
  // Awaited, not fire-and-forget; a failure must not undo the already-paid
  // reservation. Logged loudly instead; /admin/invoices lists uninvoiced
  // captured payments for exactly this case.
  try {
    await issueInvoiceForPayment({ tenantId, branchId, paymentId: payment.id, issuedBy: customerId });
  } catch (invoiceError) {
    console.error('[invoices] CRITICAL: failed to issue invoice for scheduled-booking payment', payment.id, invoiceError);
  }

  void fireNotification({
    tenantId,
    customerId,
    templateCode: 'booking_confirmed',
    params: {
      stationName: station.display_name,
      startTime: startDate.toLocaleString('en-GB', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }),
      durationMinutes: String(durationMinutes),
      referenceCode: booking.reference_code,
    },
    referenceType: 'booking',
    referenceId: booking.id,
  });

  return {
    bookingId: booking.id,
    referenceCode: booking.reference_code,
    amountCents,
    chargedCents,
    balanceCents,
    scheduledStartAt: startDate.toISOString(),
    scheduledEndAt: endDate.toISOString(),
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

/**
 * Cashier marks a scheduled-booking customer as arrived (present) — safe
 * from the no-show cutoff. If it's already at/after the scheduled start
 * time, this immediately starts the session too.
 */
export async function markBookingPresent(bookingId: string, tenantId: string, actorId: string): Promise<void> {
  const admin = createAdminClient();

  const { data: booking, error } = await admin
    .from('bookings')
    .select('id, status, scheduled_start_at')
    .eq('id', bookingId)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  if (error || !booking) throw new Error('Booking not found');
  if (booking.status !== 'confirmed' && booking.status !== 'checked_in') {
    throw new Error('booking_not_confirmable');
  }

  await admin
    .from('bookings')
    .update({ customer_present: true, present_marked_at: new Date().toISOString() } as never)
    .eq('id', bookingId);

  await admin.from('activity_log').insert({
    tenant_id: tenantId,
    actor_id: actorId,
    actor_role: 'staff',
    action: 'booking.present_marked',
    entity_type: 'booking',
    entity_id: bookingId,
    after: null,
  });

  if (new Date(booking.scheduled_start_at) <= new Date()) {
    await startScheduledBookingSession(bookingId, tenantId, actorId, false);
  }
}

/**
 * Start the session for a scheduled booking — called on cashier check-in at
 * or after the scheduled time, or by the auto-start cron. Awards loyalty
 * points now (the session is actually starting), respecting a double_points
 * offer if one was applied at booking time.
 */
export async function startScheduledBookingSession(
  bookingId: string,
  tenantId: string,
  actorId: string | null,
  isAutoStart: boolean
): Promise<{ sessionId: string }> {
  const admin = createAdminClient();

  const { data: booking, error } = await admin
    .from('bookings')
    .select('id, branch_id, station_id, game_type_id, customer_id, duration_minutes, player_count, game_count, wallet_paid_cents, status, held_payment_id')
    .eq('id', bookingId)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  if (error || !booking) throw new Error('Booking not found');
  if (booking.status === 'in_session') throw new Error('already_started');
  if (booking.status !== 'confirmed' && booking.status !== 'checked_in') {
    throw new Error('booking_not_startable');
  }
  if (!booking.station_id) throw new Error('booking_has_no_station');

  // Best-effort re-check: something else (e.g. an over-running walk-in) may
  // still be occupying the station right at start time.
  const { data: activeSession } = await admin
    .from('sessions')
    .select('id')
    .eq('station_id', booking.station_id)
    .in('status', ['active', 'paused'])
    .maybeSingle();
  if (activeSession) throw new Error('station_still_occupied');

  const startedAt = new Date().toISOString();

  // Re-derive the predicted duration at start time (not just carried over
  // from booking time) — training data for the future learning engine
  // should reflect the formula as it stood right before the session began.
  let predictedDurationMinutes: number | null = null;
  if (booking.game_count) {
    const bowling = await computeBowlingDuration({
      tenantId,
      gameTypeId: booking.game_type_id,
      playerCount: booking.player_count ?? 1,
      gameCount: booking.game_count as 1 | 2,
    });
    predictedDurationMinutes = bowling.predicted;
  }

  const { data: session, error: sessionError } = await admin
    .from('sessions')
    .insert({
      tenant_id: tenantId,
      branch_id: booking.branch_id,
      station_id: booking.station_id,
      customer_id: booking.customer_id,
      duration_mode: 'custom',
      planned_duration_seconds: (booking.duration_minutes ?? 60) * 60,
      started_at: startedAt,
      status: 'active',
      player_count: booking.player_count ?? 1,
      game_count: booking.game_count ?? null,
      predicted_duration_minutes: predictedDurationMinutes,
      booking_id: booking.id,
    } as never)
    .select('id')
    .single();
  if (sessionError || !session) throw sessionError ?? new Error('Failed to create session');

  if (booking.held_payment_id) {
    await admin.from('payments').update({ session_id: session.id }).eq('id', booking.held_payment_id);
  }

  await admin
    .from('bookings')
    .update({ status: 'in_session', checked_in_at: startedAt, auto_started: isAutoStart } as never)
    .eq('id', bookingId);

  await admin.from('activity_log').insert({
    tenant_id: tenantId,
    branch_id: booking.branch_id,
    actor_id: actorId,
    actor_role: (actorId ? 'staff' : null) as never,
    action: 'booking.session_started',
    entity_type: 'session',
    entity_id: session.id,
    after: { auto: isAutoStart, booking_id: booking.id },
  });

  if (booking.customer_id) {
    const { data: redemptionRaw } = await admin
      .from('offer_redemptions' as never)
      .select('offer_id')
      .eq('booking_id', bookingId)
      .maybeSingle();
    const redemption = redemptionRaw as unknown as { offer_id: string } | null;

    let doublePoints = false;
    if (redemption) {
      const { data: offerRaw } = await admin.from('offers').select('discount_type').eq('id', redemption.offer_id).maybeSingle();
      const offer = offerRaw as unknown as { discount_type: string } | null;
      doublePoints = offer?.discount_type === 'double_points';
    }

    const points = computePointsEarned(booking.wallet_paid_cents, doublePoints);
    await awardPoints({
      tenantId,
      customerId: booking.customer_id,
      points,
      reason: 'scheduled_booking',
      referenceType: 'session',
      referenceId: session.id,
      actorId: actorId ?? booking.customer_id,
    });
  }

  const { data: station } = await admin.from('stations').select('code, game_type_id').eq('id', booking.station_id).maybeSingle();
  if (station) {
    const { data: gameType } = await admin.from('game_types').select('category').eq('id', station.game_type_id).maybeSingle();
    if (gameType) void fireStartLightSequence(station.code, gameType.category, booking.branch_id);
  }

  return { sessionId: session.id };
}

export interface EarlyStartCollisionInfo {
  bookingId?: string;
  customerName?: string;
  /** ISO instant — the conflicting booking's scheduled start, or the running session's start. */
  time: string;
}

export interface StartBookingEarlyResult {
  ok: boolean;
  needsConfirmation?: 'simple' | 'collision';
  collisionInfo?: EarlyStartCollisionInfo;
  newStart?: string;
  newEnd?: string;
  sessionId?: string;
  error?: string;
}

/**
 * Find whatever is actually occupying `stationId` during [start, end) other
 * than the booking being started early — either a different reservation
 * (checked first, since that's what the collision message names) or a
 * currently-running session with no future reservation attached to it.
 * Only ever called after is_station_free_for_window() has already said
 * "not free" — this just explains *why*, for the collision prompt.
 */
async function findEarlyStartConflict(
  admin: ReturnType<typeof createAdminClient>,
  stationId: string,
  startIso: string,
  endIso: string,
  excludeBookingId: string,
): Promise<EarlyStartCollisionInfo | null> {
  const { data: conflictingBookings } = await admin
    .from('bookings')
    .select('id, customer_id, scheduled_start_at')
    .eq('station_id', stationId)
    .neq('id', excludeBookingId)
    .in('status', ['confirmed', 'checked_in', 'in_session'])
    .lt('scheduled_start_at', endIso)
    .gt('scheduled_end_at', startIso)
    .order('scheduled_start_at', { ascending: true })
    .limit(1);

  if (conflictingBookings && conflictingBookings.length > 0) {
    const b = conflictingBookings[0];
    let customerName: string | undefined;
    if (b.customer_id) {
      const { data: profile } = await admin.from('profiles').select('full_name').eq('id', b.customer_id).maybeSingle();
      customerName = profile?.full_name ?? undefined;
    }
    return { bookingId: b.id, customerName, time: b.scheduled_start_at };
  }

  const { data: activeSessions } = await admin
    .from('sessions')
    .select('id, customer_id, customer_label, started_at')
    .eq('station_id', stationId)
    .in('status', ['active', 'paused'])
    .limit(1);

  if (activeSessions && activeSessions.length > 0) {
    const s = activeSessions[0];
    let customerName = s.customer_label ?? undefined;
    if (!customerName && s.customer_id) {
      const { data: profile } = await admin.from('profiles').select('full_name').eq('id', s.customer_id).maybeSingle();
      customerName = profile?.full_name ?? undefined;
    }
    return { customerName, time: s.started_at };
  }

  return null;
}

/**
 * Start a confirmed booking's session before its scheduled time — the whole
 * window shifts earlier (newStart = now, newEnd = now + the FULL original
 * booked duration); the session is never shortened.
 *
 * Graded confirmation, never silently bypassed:
 *   - free window            -> needsConfirmation:'simple' until force=true
 *   - overlaps another
 *     booking/live session   -> needsConfirmation:'collision' until force=true
 * `force` only ever comes from the cashier's own explicit second tap on the
 * matching prompt (plain confirm for 'simple', a deliberate red confirm for
 * 'collision') — the overlap check itself reruns on every call regardless of
 * `force`, so nothing here can skip it.
 *
 * Once clear (or forced), this delegates the actual session/payment-linking/
 * points logic entirely to startScheduledBookingSession — early start isn't
 * a different session-creation path, it's the same one, just called before
 * the scheduled time after this extra overlap-aware pre-check.
 */
export async function startBookingEarly(input: {
  bookingId: string;
  tenantId: string;
  actorId: string;
  force?: boolean;
}): Promise<StartBookingEarlyResult> {
  const { bookingId, tenantId, actorId, force = false } = input;
  const admin = createAdminClient();

  const { data: booking, error } = await admin
    .from('bookings')
    .select('id, branch_id, station_id, scheduled_start_at, duration_minutes, status')
    .eq('id', bookingId)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  if (error || !booking) return { ok: false, error: 'booking_not_found' };
  if (booking.status !== 'confirmed' && booking.status !== 'checked_in') return { ok: false, error: 'booking_not_startable' };
  if (!booking.station_id) return { ok: false, error: 'booking_has_no_station' };

  const now = new Date();
  const durationMinutes = booking.duration_minutes ?? 60;
  const newStart = now;
  const newEnd = new Date(now.getTime() + durationMinutes * 60_000);
  const scheduledStart = new Date(booking.scheduled_start_at);

  // Venue-configured cap, if any — null means unlimited. Applies even when
  // force=true; force only overrides the collision warning, never this.
  const { data: branch } = await admin
    .from('branches')
    .select('early_start_window_minutes')
    .eq('id', booking.branch_id)
    .maybeSingle();
  const cap = branch?.early_start_window_minutes ?? null;
  if (cap !== null && now < scheduledStart) {
    const earliestAllowed = new Date(scheduledStart.getTime() - cap * 60_000);
    if (now < earliestAllowed) {
      return { ok: false, error: 'too_early', newStart: earliestAllowed.toISOString() };
    }
  }

  const isFree = await isStationFreeForWindow(booking.station_id, newStart.toISOString(), newEnd.toISOString(), bookingId);

  if (!isFree) {
    const conflict = await findEarlyStartConflict(admin, booking.station_id, newStart.toISOString(), newEnd.toISOString(), bookingId);
    if (!force) {
      return {
        ok: false,
        needsConfirmation: 'collision',
        collisionInfo: conflict ?? { time: newStart.toISOString() },
        newStart: newStart.toISOString(),
        newEnd: newEnd.toISOString(),
      };
    }

    const result = await startScheduledBookingSession(bookingId, tenantId, actorId, false);
    await logEarlyStart(admin, tenantId, booking.branch_id, actorId, bookingId, scheduledStart, newStart, newEnd, true);
    if (conflict?.bookingId) {
      await admin
        .from('bookings')
        .update({
          early_start_collision: true,
          early_start_collision_note: `Station may already be occupied — booking ${bookingId} was started early at ${newStart.toISOString()}, overlapping this reservation.`,
        } as never)
        .eq('id', conflict.bookingId);
    }
    return { ok: true, sessionId: result.sessionId, newStart: newStart.toISOString(), newEnd: newEnd.toISOString() };
  }

  if (!force) {
    return { ok: false, needsConfirmation: 'simple', newStart: newStart.toISOString(), newEnd: newEnd.toISOString() };
  }

  const result = await startScheduledBookingSession(bookingId, tenantId, actorId, false);
  await logEarlyStart(admin, tenantId, booking.branch_id, actorId, bookingId, scheduledStart, newStart, newEnd, false);
  return { ok: true, sessionId: result.sessionId, newStart: newStart.toISOString(), newEnd: newEnd.toISOString() };
}

async function logEarlyStart(
  admin: ReturnType<typeof createAdminClient>,
  tenantId: string,
  branchId: string,
  actorId: string,
  bookingId: string,
  originalStart: Date,
  newStart: Date,
  newEnd: Date,
  collisionOverridden: boolean,
): Promise<void> {
  await admin.from('activity_log').insert({
    tenant_id: tenantId,
    branch_id: branchId,
    actor_id: actorId,
    actor_role: 'staff',
    action: 'booking.started_early',
    entity_type: 'booking',
    entity_id: bookingId,
    after: {
      original_start: originalStart.toISOString(),
      new_start: newStart.toISOString(),
      new_end: newEnd.toISOString(),
      collision_overridden: collisionOverridden,
    },
  });
}

/**
 * Mark a booking as no-show — not present by (scheduled_start_at - 10min).
 * Forfeits the payment (no refund) and releases the slot: since
 * is_station_free_for_window() only blocks on confirmed/checked_in/in_session
 * bookings, a 'no_show' booking is automatically excluded and the slot frees.
 */
export async function markBookingNoShow(bookingId: string, tenantId: string, actorId: string | null): Promise<void> {
  const admin = createAdminClient();

  const { data: booking, error } = await admin
    .from('bookings')
    .select('id, status, customer_present, scheduled_start_at, wallet_paid_cents')
    .eq('id', bookingId)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  if (error || !booking) throw new Error('Booking not found');
  if (booking.status !== 'confirmed') throw new Error('booking_not_no_showable');
  if (booking.customer_present) throw new Error('customer_already_present');

  const cutoff = new Date(new Date(booking.scheduled_start_at).getTime() - NO_SHOW_CUTOFF_MINUTES * 60_000);
  if (new Date() < cutoff) throw new Error('cutoff_not_reached');

  await admin
    .from('bookings')
    .update({ status: 'no_show', no_show_at: new Date().toISOString(), slot_released: true } as never)
    .eq('id', bookingId);

  await admin.from('activity_log').insert({
    tenant_id: tenantId,
    actor_id: actorId,
    actor_role: (actorId ? 'staff' : null) as never,
    action: 'booking.no_show',
    entity_type: 'booking',
    entity_id: bookingId,
    after: { forfeited_cents: booking.wallet_paid_cents },
  });
}

/**
 * Cancel a scheduled booking BEFORE the no-show cutoff → store credit.
 * After the cutoff, cancellation is no longer offered — it becomes a no-show.
 */
export async function cancelScheduledBooking(
  bookingId: string,
  tenantId: string,
  actorId: string,
  byStaff: boolean
): Promise<{ creditedCents: number; balanceCents: number }> {
  const admin = createAdminClient();

  const { data: booking, error } = await admin
    .from('bookings')
    .select('id, branch_id, customer_id, status, scheduled_start_at, wallet_paid_cents')
    .eq('id', bookingId)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  if (error || !booking) throw new Error('Booking not found');
  if (booking.status !== 'confirmed') throw new Error('booking_not_cancellable');
  if (!booking.customer_id) throw new Error('booking_has_no_customer');

  const cutoff = new Date(new Date(booking.scheduled_start_at).getTime() - NO_SHOW_CUTOFF_MINUTES * 60_000);
  if (new Date() >= cutoff) throw new Error('past_cutoff');

  const { data: branch } = await admin.from('branches').select('queue_policy').eq('id', booking.branch_id).maybeSingle();
  const policy = (branch?.queue_policy ?? {}) as Record<string, unknown>;
  const creditPercent = typeof policy.cancellation_credit_percent === 'number' ? policy.cancellation_credit_percent : 100;
  const creditedCents = Math.round((booking.wallet_paid_cents * creditPercent) / 100);

  let balanceCents: number;
  if (creditedCents > 0) {
    const credit = await creditWallet({
      tenantId,
      customerId: booking.customer_id,
      amountCents: creditedCents,
      kind: 'credit_cancellation',
      reason: 'Scheduled booking cancelled',
      referenceType: 'booking',
      referenceId: bookingId,
      createdBy: actorId,
    });
    balanceCents = credit.balanceCents;
  } else {
    const { data: wallet } = await admin.from('wallets').select('balance_cents').eq('tenant_id', tenantId).eq('customer_id', booking.customer_id).maybeSingle();
    balanceCents = wallet?.balance_cents ?? 0;
  }

  await admin
    .from('bookings')
    .update({ status: 'cancelled', cancelled_at: new Date().toISOString(), slot_released: true } as never)
    .eq('id', bookingId);

  await admin.from('activity_log').insert({
    tenant_id: tenantId,
    actor_id: actorId,
    actor_role: (byStaff ? 'staff' : 'customer') as never,
    action: 'booking.cancelled',
    entity_type: 'booking',
    entity_id: bookingId,
    after: { credited_cents: creditedCents },
  });

  return { creditedCents, balanceCents };
}

export interface CustomerUpcomingBooking {
  bookingId: string;
  referenceCode: string;
  stationName: string;
  gameTypeName: string;
  scheduledStartAt: string;
  scheduledEndAt: string;
  durationMinutes: number;
  status: string;
  customerPresent: boolean;
  amountCents: number;
}

/** A customer's upcoming scheduled bookings, for their dashboard. */
export async function getCustomerUpcomingBookings(tenantId: string, customerId: string): Promise<CustomerUpcomingBooking[]> {
  const admin = createAdminClient();

  const { data, error } = await admin
    .from('bookings')
    .select('id, reference_code, station_id, game_type_id, scheduled_start_at, scheduled_end_at, duration_minutes, status, customer_present, wallet_paid_cents')
    .eq('tenant_id', tenantId)
    .eq('customer_id', customerId)
    .eq('booking_mode', 'scheduled')
    .in('status', ['confirmed', 'checked_in'])
    .order('scheduled_start_at', { ascending: true });
  if (error) throw error;
  if (!data || data.length === 0) return [];

  const stationIds = [...new Set(data.map((b) => b.station_id).filter((id): id is string => !!id))];
  const gameTypeIds = [...new Set(data.map((b) => b.game_type_id))];
  const [{ data: stations }, { data: gameTypes }] = await Promise.all([
    stationIds.length ? admin.from('stations').select('id, display_name').in('id', stationIds) : Promise.resolve({ data: [] as Array<{ id: string; display_name: string }> }),
    admin.from('game_types').select('id, display_name_en, display_name_ar').in('id', gameTypeIds),
  ]);
  const stationMap = new Map((stations ?? []).map((s) => [s.id, s.display_name]));
  const gameTypeMap = new Map((gameTypes ?? []).map((g) => [g.id, g.display_name_ar ?? g.display_name_en]));

  return data.map((b) => ({
    bookingId: b.id,
    referenceCode: b.reference_code,
    stationName: b.station_id ? (stationMap.get(b.station_id) ?? '—') : '—',
    gameTypeName: gameTypeMap.get(b.game_type_id) ?? '',
    scheduledStartAt: b.scheduled_start_at,
    scheduledEndAt: b.scheduled_end_at ?? b.scheduled_start_at,
    durationMinutes: b.duration_minutes ?? 0,
    status: b.status,
    customerPresent: b.customer_present,
    amountCents: b.wallet_paid_cents,
  }));
}

/** Active stations of a game type that are free for a given future window — for the scheduling UI. */
export async function getAvailableStationsForWindow(input: {
  tenantId: string;
  branchId: string;
  gameTypeId: string;
  scheduledStartAt: string;
  durationMinutes: number;
}): Promise<Array<{ stationId: string; code: string; displayName: string }>> {
  const admin = createAdminClient();

  const { data: stations, error } = await admin
    .from('stations')
    .select('id, code, display_name')
    .eq('tenant_id', input.tenantId)
    .eq('branch_id', input.branchId)
    .eq('game_type_id', input.gameTypeId)
    .eq('is_active', true)
    .order('code', { ascending: true });
  if (error) throw error;
  if (!stations || stations.length === 0) return [];

  const start = new Date(input.scheduledStartAt);
  if (Number.isNaN(start.getTime())) return [];
  const end = new Date(start.getTime() + input.durationMinutes * 60_000);

  const results: Array<{ stationId: string; code: string; displayName: string }> = [];
  for (const s of stations) {
    const free = await isStationFreeForWindow(s.id, start.toISOString(), end.toISOString());
    if (free) results.push({ stationId: s.id, code: s.code, displayName: s.display_name });
  }
  return results;
}

// =====================================================================
// CINEMA-STYLE SLOT GRID — read-only slot availability for the booking UI.
// =====================================================================

async function loadVenueDayContext(tenantId: string, branchId: string) {
  const admin = createAdminClient();
  const [{ data: branch, error: branchError }, { data: tenant, error: tenantError }] = await Promise.all([
    admin.from('branches').select('opens_at, closes_at').eq('id', branchId).maybeSingle(),
    admin.from('tenants').select('timezone').eq('id', tenantId).maybeSingle(),
  ]);
  if (branchError || !branch) throw new Error('Branch not found');
  if (tenantError || !tenant) throw new Error('Tenant not found');
  return { opensAt: branch.opens_at, closesAt: branch.closes_at, timezone: tenant.timezone };
}

/** Busy windows (reservations + live sessions) for a set of stations, restricted to one venue-day window. */
async function loadBusyWindowsByStation(
  stationIds: string[],
  openISO: string,
  closeISO: string,
): Promise<Map<string, BusyWindow[]>> {
  const admin = createAdminClient();
  const byStation = new Map<string, BusyWindow[]>();
  if (stationIds.length === 0) return byStation;

  const [{ data: bookingRows }, { data: sessionRows }] = await Promise.all([
    admin
      .from('bookings')
      .select('station_id, scheduled_start_at, scheduled_end_at')
      .in('station_id', stationIds)
      .in('status', ['confirmed', 'checked_in', 'in_session'])
      .lt('scheduled_start_at', closeISO)
      .gt('scheduled_end_at', openISO),
    admin
      .from('sessions')
      .select('station_id, started_at, ends_at')
      .in('station_id', stationIds)
      .in('status', ['active', 'paused']),
  ]);

  for (const b of bookingRows ?? []) {
    if (!b.station_id || !b.scheduled_end_at) continue;
    const arr = byStation.get(b.station_id) ?? [];
    arr.push({ start: b.scheduled_start_at, end: b.scheduled_end_at });
    byStation.set(b.station_id, arr);
  }

  const openMs = new Date(openISO).getTime();
  const closeMs = new Date(closeISO).getTime();
  for (const s of sessionRows ?? []) {
    const startMs = new Date(s.started_at).getTime();
    // Open-ended (still-running) sessions block from started_at onward.
    const endMs = s.ends_at ? new Date(s.ends_at).getTime() : Number.POSITIVE_INFINITY;
    if (startMs >= closeMs || endMs <= openMs) continue;
    const arr = byStation.get(s.station_id) ?? [];
    arr.push({ start: s.started_at, end: s.ends_at ?? new Date(closeMs + 1).toISOString() });
    byStation.set(s.station_id, arr);
  }

  return byStation;
}

export interface StationSlotGrid {
  slots: SlotAvailability[];
  opensAt: string;
  closesAt: string;
}

/** The slot grid for a single station on a venue-day, with availability computed. */
export async function getStationSlots(input: {
  tenantId: string;
  branchId: string;
  stationId: string;
  venueDate: string;
  durationMinutes: number;
}): Promise<StationSlotGrid> {
  const { opensAt, closesAt, timezone } = await loadVenueDayContext(input.tenantId, input.branchId);
  const venueSlots = generateSlotsForVenueDay({ venueDate: input.venueDate, opensAt, closesAt, timezone });
  const { openISO, closeISO } = getVenueDayWindow(input.venueDate, opensAt, closesAt, timezone);

  const busyByStation = await loadBusyWindowsByStation([input.stationId], openISO, closeISO);

  return {
    slots: computeSlotAvailability({
      slots: venueSlots,
      durationMinutes: input.durationMinutes,
      closesAtISO: closeISO,
      nowISO: new Date().toISOString(),
      busyWindows: busyByStation.get(input.stationId) ?? [],
    }),
    opensAt,
    closesAt,
  };
}

export interface GameTypeStationSlots {
  stationId: string;
  stationCode: string;
  stationName: string;
  slots: SlotAvailability[];
}

/** Slot availability across every active station of a game type, for the cinema-style booking grid. */
export async function getGameTypeSlots(input: {
  tenantId: string;
  branchId: string;
  gameTypeId: string;
  venueDate: string;
  durationMinutes: number;
}): Promise<GameTypeStationSlots[]> {
  const admin = createAdminClient();
  const { opensAt, closesAt, timezone } = await loadVenueDayContext(input.tenantId, input.branchId);

  const { data: stations, error } = await admin
    .from('stations')
    .select('id, code, display_name')
    .eq('tenant_id', input.tenantId)
    .eq('branch_id', input.branchId)
    .eq('game_type_id', input.gameTypeId)
    .eq('is_active', true)
    .order('code', { ascending: true });
  if (error) throw error;
  if (!stations || stations.length === 0) return [];

  const venueSlots = generateSlotsForVenueDay({ venueDate: input.venueDate, opensAt, closesAt, timezone });
  const { openISO, closeISO } = getVenueDayWindow(input.venueDate, opensAt, closesAt, timezone);
  const nowISO = new Date().toISOString();

  const busyByStation = await loadBusyWindowsByStation(
    stations.map((s) => s.id),
    openISO,
    closeISO,
  );

  return stations.map((s) => ({
    stationId: s.id,
    stationCode: s.code,
    stationName: s.display_name,
    slots: computeSlotAvailability({
      slots: venueSlots,
      durationMinutes: input.durationMinutes,
      closesAtISO: closeISO,
      nowISO,
      busyWindows: busyByStation.get(s.id) ?? [],
    }),
  }));
}
