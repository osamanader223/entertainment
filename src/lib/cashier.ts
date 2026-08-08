import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { normalizePhone } from '@/lib/utils';
import { debitWallet } from '@/lib/wallet';
import { runLightSequence } from '@/lib/ifttt';
import { awardPoints, computePointsEarned } from '@/lib/loyalty';
import { isStationFreeForWindow } from '@/lib/station-overlap';
import { issueInvoiceForPayment } from '@/lib/invoices';
import { addSessionToCart } from '@/lib/carts';

export interface CashierCustomer {
  id: string;
  full_name: string | null;
  phone: string;
}

/**
 * Look up a customer profile by phone number.
 * Returns null if no profile exists for the normalized number.
 */
export async function lookupCustomerByPhone(phone: string): Promise<CashierCustomer | null> {
  const normalized = normalizePhone(phone, 'SA');
  if (!normalized) return null;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('profiles')
    .select('id, full_name, phone')
    .eq('phone', normalized)
    .limit(1)
    .maybeSingle();

  if (error || !data || !data.phone) return null;
  return { id: data.id, full_name: data.full_name, phone: data.phone };
}

/**
 * Create a customer account from the cashier (phone-only auth user, same
 * mechanism a self-signup uses) — the handle_new_user trigger creates the
 * profiles row. This is a REAL account, not a second-class "walk-in": the
 * phone becomes their login, and it earns loyalty points like any other
 * customer (no walk_in_created flag is set). If the phone is already
 * registered, falls back to returning the existing customer.
 */
export async function createWalkInCustomer({
  phone,
  fullName,
}: {
  phone: string;
  fullName: string;
}): Promise<{ id: string }> {
  const normalized = normalizePhone(phone, 'SA');
  if (!normalized) throw new Error('Invalid phone number');

  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.createUser({
    phone: normalized,
    phone_confirm: true,
    user_metadata: { full_name: fullName },
  });

  if (error || !data.user) {
    const existing = await lookupCustomerByPhone(normalized);
    if (existing) return { id: existing.id };
    throw error ?? new Error('Failed to create walk-in customer');
  }

  const userId = data.user.id;

  await admin
    .from('profiles')
    .update({ full_name: fullName })
    .eq('id', userId);

  return { id: userId };
}

/**
 * Compute the price (in halalas) for a session of a given game type and duration.
 * Picks the highest-priority active pricing rule, preferring branch-specific rules.
 *
 * playerCount/gameCount only matter for the 'per_player_hour' unit — despite
 * the legacy name, it's used as a true per-player-per-game rate (e.g.
 * bowling's 30 SAR/player-game), not an hourly one. Every other unit ignores
 * them entirely.
 */
export async function computeSessionPrice({
  gameTypeId,
  durationMinutes,
  branchId,
  playerCount = 1,
  gameCount = 1,
}: {
  gameTypeId: string;
  durationMinutes: number;
  branchId: string;
  playerCount?: number;
  gameCount?: number;
}): Promise<number> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('pricing_rules')
    .select('unit, amount_cents, priority, branch_id')
    .eq('game_type_id', gameTypeId)
    .eq('is_active', true)
    .or(`branch_id.is.null,branch_id.eq.${branchId}`);

  if (error) throw error;
  const rules = data ?? [];
  if (rules.length === 0) throw new Error('No pricing rule found for this game type');

  rules.sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority;
    // Prefer branch-specific rules over tenant-wide ones on a priority tie.
    if (a.branch_id && !b.branch_id) return -1;
    if (!a.branch_id && b.branch_id) return 1;
    return 0;
  });
  const rule = rules[0];

  const hours = durationMinutes / 60;
  let amount: number;
  switch (rule.unit) {
    case 'per_minute':
      amount = rule.amount_cents * durationMinutes;
      break;
    case 'per_session':
      amount = rule.amount_cents;
      break;
    case 'per_player_hour':
      amount = rule.amount_cents * playerCount * gameCount;
      break;
    case 'per_hour':
    default:
      amount = rule.amount_cents * hours;
      break;
  }

  return Math.round(amount);
}

/**
 * Same as computeSessionPrice, but resolves the game type from a station id.
 * Used for live price previews, since the public station shape only exposes
 * game_type_code (not the internal game_type_id).
 */
export async function computeSessionPriceForStation({
  stationId,
  durationMinutes,
  playerCount,
  gameCount,
}: {
  stationId: string;
  durationMinutes: number;
  playerCount?: number;
  gameCount?: number;
}): Promise<number> {
  const admin = createAdminClient();
  const { data: station, error } = await admin
    .from('stations')
    .select('branch_id, game_type_id')
    .eq('id', stationId)
    .maybeSingle();

  if (error || !station) throw new Error('Station not found');

  return computeSessionPrice({
    gameTypeId: station.game_type_id,
    durationMinutes,
    branchId: station.branch_id,
    playerCount,
    gameCount,
  });
}

export interface StartCashierSessionArgs {
  tenantId: string;
  branchId: string;
  stationId: string;
  customerId: string;
  customerLabel: string;
  durationMinutes: number;
  /** Required unless cartId is set — a cart-mode seating defers payment to settlement. */
  paymentMethod?: 'cash' | 'wallet';
  actorId: string;
  /** The cashier's currently open shift — every cashier transaction is stamped with it. */
  shiftId: string;
  /** When set, the charge is added as a cart line item instead of paid immediately. */
  cartId?: string;
  /** Bowling only — resolved by the caller via computeBowlingDuration(). */
  playerCount?: number;
  gameCount?: number;
  predictedDurationMinutes?: number;
}

export interface StartCashierSessionResult {
  sessionId: string;
  paymentId: string | null;
  amountCents: number;
}

/**
 * Seat a walk-in customer at a station: validate availability, charge them
 * (cash record or wallet debit) OR add the charge to a running cart, open the
 * session, and log the activity. The sync_station_status trigger flips the
 * station to 'occupied' on session insert.
 */
export async function startCashierSession({
  tenantId,
  branchId,
  stationId,
  customerId,
  customerLabel,
  durationMinutes,
  paymentMethod,
  actorId,
  shiftId,
  cartId,
  playerCount,
  gameCount,
  predictedDurationMinutes,
}: StartCashierSessionArgs): Promise<StartCashierSessionResult> {
  if (!cartId && !paymentMethod) throw new Error('payment_method_required');
  const admin = createAdminClient();

  const { data: station, error: stationError } = await admin
    .from('stations')
    .select('id, branch_id, status, game_type_id, display_name, code')
    .eq('id', stationId)
    .maybeSingle();

  if (stationError || !station) throw new Error('Station not found');
  if (station.branch_id !== branchId) throw new Error('Station does not belong to this branch');
  if (station.status !== 'available') throw new Error('Station is not available');

  // A walk-in that would run into an upcoming reservation is blocked here —
  // the cashier should pick another station or a shorter duration.
  const walkInNow = new Date();
  const walkInWindowEnd = new Date(walkInNow.getTime() + durationMinutes * 60_000);
  if (!(await isStationFreeForWindow(stationId, walkInNow.toISOString(), walkInWindowEnd.toISOString()))) {
    throw new Error('station_reserved');
  }

  const amountCents = await computeSessionPrice({
    gameTypeId: station.game_type_id,
    durationMinutes,
    branchId,
    playerCount,
    gameCount,
  });

  const { data: profile } = await admin
    .from('profiles')
    .select('walk_in_created')
    .eq('id', customerId)
    .maybeSingle();
  const isRealCustomer = !!profile && !profile.walk_in_created;

  const { data: session, error: sessionError } = await admin
    .from('sessions')
    .insert({
      tenant_id: tenantId,
      branch_id: branchId,
      station_id: stationId,
      customer_id: customerId,
      customer_label: customerLabel,
      duration_mode: 'custom',
      planned_duration_seconds: durationMinutes * 60,
      status: 'active',
      player_count: playerCount ?? 1,
      game_count: gameCount ?? null,
      predicted_duration_minutes: predictedDurationMinutes ?? null,
    } as never)
    .select('id')
    .single();

  if (sessionError || !session) throw sessionError ?? new Error('Failed to create session');

  await admin.from('activity_log').insert({
    tenant_id: tenantId,
    branch_id: branchId,
    actor_id: actorId,
    actor_role: 'staff',
    action: 'session.started_by_cashier',
    entity_type: 'session',
    entity_id: session.id,
    after: { station_id: stationId, customer_id: customerId, amount_cents: amountCents, cart_id: cartId ?? null },
  });

  void fireStartLightSequence(station.code, station.game_type_id, branchId);

  // Cart mode: defer payment to settlement. No wallet debit, no payments row,
  // no invoice, no points — all of that happens once, for the whole cart
  // total, in settleCart().
  if (cartId) {
    await addSessionToCart(cartId, session.id, amountCents, `${station.display_name}`);
    return { sessionId: session.id, paymentId: null, amountCents };
  }

  // Wallet debit is atomic (RPC) and validated first so we don't record a
  // payment/session if the customer can't actually cover the charge.
  if (paymentMethod === 'wallet') {
    await debitWallet({
      tenantId,
      customerId,
      amountCents,
      kind: 'debit_booking',
      reason: `Cashier session — ${station.display_name}`,
      referenceType: 'session',
      createdBy: actorId,
    });
  }

  const { data: payment, error: paymentError } = await admin
    .from('payments')
    .insert({
      tenant_id: tenantId,
      branch_id: branchId,
      customer_id: customerId,
      purpose: 'session',
      amount_cents: amountCents,
      currency: 'SAR',
      provider: paymentMethod === 'cash' ? 'cash' : 'manual',
      method: paymentMethod,
      status: 'captured',
      captured_at: new Date().toISOString(),
      initiated_by: actorId,
      shift_id: shiftId,
    } as never)
    .select('id')
    .single();

  if (paymentError || !payment) throw paymentError ?? new Error('Failed to record payment');

  // ZATCA Phase 1: every paid transaction gets an invoice. Awaited (not
  // fire-and-forget) so issuance actually happens before this returns — but
  // its failure must not undo an already-successful, already-paid session.
  // Logged loudly instead; /admin/invoices lists uninvoiced captured
  // payments for exactly this case.
  try {
    await issueInvoiceForPayment({
      tenantId,
      branchId,
      paymentId: payment.id,
      sessionId: session.id,
      issuedBy: actorId,
    });
  } catch (invoiceError) {
    console.error('[invoices] CRITICAL: failed to issue invoice for cashier payment', payment.id, invoiceError);
  }

  // Cash or wallet both earn points on the amount charged, but only for real
  // (non-walk-in) customer accounts.
  if (isRealCustomer) {
    await awardPoints({
      tenantId,
      customerId,
      points: computePointsEarned(amountCents, false),
      reason: 'cashier_session',
      referenceType: 'session',
      referenceId: session.id,
      actorId,
    });
  }

  return { sessionId: session.id, paymentId: payment.id, amountCents };
}

/** Fire-and-forget: runs the START smart-light sequence for a station, if the branch has IFTTT configured. */
async function fireStartLightSequence(
  stationCode: string,
  gameTypeId: string,
  branchId: string
): Promise<void> {
  const admin = createAdminClient();

  const [{ data: branch }, { data: gameType }] = await Promise.all([
    admin.from('branches').select('ifttt_webhook_key').eq('id', branchId).maybeSingle(),
    admin.from('game_types').select('category').eq('id', gameTypeId).maybeSingle(),
  ]);

  if (!branch?.ifttt_webhook_key || !gameType) return;

  void runLightSequence({ code: stationCode, gameCategory: gameType.category }, 'START', branch.ifttt_webhook_key);
}
