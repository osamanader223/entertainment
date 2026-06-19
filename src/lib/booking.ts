import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { debitWallet } from '@/lib/wallet';
import { computeSessionPrice } from '@/lib/cashier';
import { runLightSequence } from '@/lib/ifttt';
import { resolveOfferForCheckout, recordOfferRedemption } from '@/lib/offers';
import type { Database } from '@/types/database';

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
}

/**
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

  // Record offer redemption after booking is confirmed
  if (offerResult.applied && offerResult.offer) {
    // TODO(double_points): when loyalty points are calculated for this session,
    // check offer_redemptions for this booking and apply the 2× multiplier.
    await recordOfferRedemption({
      tenantId,
      offerId: offerResult.offer.id,
      customerId,
      bookingId: booking.id,
      sessionId: session.id,
      discountCents: offerResult.discountCents,
    });
  }

  void fireStartLightSequence(station.code, gameType.category, branchId);

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
