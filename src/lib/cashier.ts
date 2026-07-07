import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { normalizePhone } from '@/lib/utils';
import { debitWallet } from '@/lib/wallet';
import { runLightSequence } from '@/lib/ifttt';
import { awardPoints, computePointsEarned } from '@/lib/loyalty';

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
 * Create a walk-in customer (phone-only auth user).
 * The handle_new_user trigger creates the profiles row; we then label it as a walk-in.
 * If the phone is already registered, falls back to returning the existing customer.
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
    user_metadata: { full_name: fullName, walk_in_created: true },
  });

  if (error || !data.user) {
    const existing = await lookupCustomerByPhone(normalized);
    if (existing) return { id: existing.id };
    throw error ?? new Error('Failed to create walk-in customer');
  }

  const userId = data.user.id;

  await admin
    .from('profiles')
    .update({ walk_in_created: true, full_name: fullName })
    .eq('id', userId);

  return { id: userId };
}

/**
 * Compute the price (in halalas) for a session of a given game type and duration.
 * Picks the highest-priority active pricing rule, preferring branch-specific rules.
 */
export async function computeSessionPrice({
  gameTypeId,
  durationMinutes,
  branchId,
}: {
  gameTypeId: string;
  durationMinutes: number;
  branchId: string;
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
    case 'per_hour':
    case 'per_player_hour':
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
}: {
  stationId: string;
  durationMinutes: number;
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
  });
}

export interface StartCashierSessionArgs {
  tenantId: string;
  branchId: string;
  stationId: string;
  customerId: string;
  customerLabel: string;
  durationMinutes: number;
  paymentMethod: 'cash' | 'wallet';
  actorId: string;
}

export interface StartCashierSessionResult {
  sessionId: string;
  paymentId: string;
  amountCents: number;
}

/**
 * Seat a walk-in customer at a station: validate availability, charge them
 * (cash record or wallet debit), open the session, and log the activity.
 * The sync_station_status trigger flips the station to 'occupied' on session insert.
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
}: StartCashierSessionArgs): Promise<StartCashierSessionResult> {
  const admin = createAdminClient();

  const { data: station, error: stationError } = await admin
    .from('stations')
    .select('id, branch_id, status, game_type_id, display_name, code')
    .eq('id', stationId)
    .maybeSingle();

  if (stationError || !station) throw new Error('Station not found');
  if (station.branch_id !== branchId) throw new Error('Station does not belong to this branch');
  if (station.status !== 'available') throw new Error('Station is not available');

  const amountCents = await computeSessionPrice({
    gameTypeId: station.game_type_id,
    durationMinutes,
    branchId,
  });

  const { data: profile } = await admin
    .from('profiles')
    .select('walk_in_created')
    .eq('id', customerId)
    .maybeSingle();
  const isRealCustomer = !!profile && !profile.walk_in_created;

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
      customer_label: customerLabel,
      duration_mode: 'custom',
      planned_duration_seconds: durationMinutes * 60,
      status: 'active',
      player_count: 1,
    })
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
    after: { station_id: stationId, customer_id: customerId, amount_cents: amountCents },
  });

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

  void fireStartLightSequence(station.code, station.game_type_id, branchId);

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
