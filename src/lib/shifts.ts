import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { getVenueDateForNow } from '@/lib/slots';

export interface Shift {
  id: string;
  openedAt: string;
  openingFloatCents: number;
  storeDate: string;
  status: 'open' | 'closed';
}

export interface ShiftMethodTotals {
  cashCents: number;
  cardCents: number;
  walletCents: number;
}

export interface ShiftSummary extends ShiftMethodTotals {
  sessionCount: number;
  cartCount: number;
  totalCollectedCents: number;
}

export interface CloseShiftResult {
  expectedCashCents: number;
  expectedCardCents: number;
  expectedWalletCents: number;
  countedCashCents: number;
  varianceCents: number;
}

/** cash → cash bucket, wallet → wallet bucket, every card-ish rail (card/mada/visa/…) → card bucket. */
function bucketMethod(method: string | null): keyof ShiftMethodTotals | null {
  if (method === 'cash') return 'cashCents';
  if (method === 'wallet') return 'walletCents';
  if (method) return 'cardCents';
  return null;
}

async function sumPaymentsByMethod(shiftId: string): Promise<ShiftMethodTotals> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('payments')
    .select('amount_cents, method')
    .eq('shift_id', shiftId)
    .eq('status', 'captured');
  if (error) throw error;

  const totals: ShiftMethodTotals = { cashCents: 0, cardCents: 0, walletCents: 0 };
  for (const row of data ?? []) {
    const bucket = bucketMethod(row.method);
    if (bucket) totals[bucket] += row.amount_cents;
  }
  return totals;
}

/** Today's venue-day date ('YYYY-MM-DD'), per the branch's own opening hours + tenant timezone. */
async function resolveStoreDateForToday(branchId: string): Promise<string> {
  const admin = createAdminClient();
  const { data: branch, error } = await admin
    .from('branches')
    .select('opens_at, closes_at, tenant_id')
    .eq('id', branchId)
    .maybeSingle();
  if (error || !branch) throw error ?? new Error('Branch not found');

  const { data: tenant } = await admin.from('tenants').select('timezone').eq('id', branch.tenant_id).maybeSingle();
  const timezone = tenant?.timezone ?? 'Asia/Riyadh';

  return getVenueDateForNow(branch.opens_at, branch.closes_at, timezone);
}

function toShift(row: {
  id: string;
  opened_at: string;
  opening_float_cents: number;
  store_date: string;
  status: string;
}): Shift {
  return {
    id: row.id,
    openedAt: row.opened_at,
    openingFloatCents: row.opening_float_cents,
    storeDate: row.store_date,
    status: row.status as 'open' | 'closed',
  };
}

/** The shift row for this branch's current store-day, if one has been created yet (open or closed). */
export async function getCurrentStoreDayShift(tenantId: string, branchId: string): Promise<Shift | null> {
  const admin = createAdminClient();
  const storeDate = await resolveStoreDateForToday(branchId);

  const { data, error } = await admin
    .from('cashier_shifts')
    .select('id, opened_at, opening_float_cents, store_date, status')
    .eq('tenant_id', tenantId)
    .eq('branch_id', branchId)
    .eq('store_date', storeDate)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return toShift(data);
}

/**
 * Ensure today's store-day shift exists and is usable, auto-opening one if
 * this is the first transaction of the day. Returns `null` if today's shift
 * already exists but was already closed — the day has been reconciled and
 * is not silently reopened; a manager would need to handle that case
 * explicitly (out of scope here, kept simple per the "keep it simple" brief).
 *
 * Opening float is carried over from the branch's most recently CLOSED
 * shift's counted cash (what was actually in the drawer at last close),
 * defaulting to 0 if there is no prior shift — there is no manual
 * open-float entry step in this model.
 */
export async function ensureShiftOpenForToday(tenantId: string, branchId: string, actorId: string): Promise<Shift | null> {
  const existing = await getCurrentStoreDayShift(tenantId, branchId);
  if (existing) return existing.status === 'open' ? existing : null;

  const admin = createAdminClient();
  const storeDate = await resolveStoreDateForToday(branchId);

  const { data: lastClosed } = await admin
    .from('cashier_shifts')
    .select('counted_cash_cents')
    .eq('tenant_id', tenantId)
    .eq('branch_id', branchId)
    .eq('status', 'closed')
    .order('opened_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  const openingFloatCents = lastClosed?.counted_cash_cents ?? 0;

  const { data, error } = await admin
    .from('cashier_shifts')
    .insert({
      tenant_id: tenantId,
      branch_id: branchId,
      cashier_id: actorId,
      opening_float_cents: openingFloatCents,
      store_date: storeDate,
    } as never)
    .select('id, opened_at, opening_float_cents, store_date, status')
    .single();
  // A concurrent request may have inserted today's row first (unique
  // (branch_id, store_date)) — that's not a real failure, just re-read it.
  if (error || !data) {
    const raced = await getCurrentStoreDayShift(tenantId, branchId);
    if (raced) return raced.status === 'open' ? raced : null;
    throw error ?? new Error('Failed to open store-day shift');
  }

  await admin.from('activity_log').insert({
    tenant_id: tenantId,
    branch_id: branchId,
    actor_id: actorId,
    actor_role: 'staff',
    action: 'shift.opened',
    entity_type: 'cashier_shift',
    entity_id: data.id,
    after: { opening_float_cents: openingFloatCents, store_date: storeDate, carried_over: (lastClosed?.counted_cash_cents ?? null) !== null },
  });

  return toShift(data);
}

/**
 * Close the current store-day: sum this shift's captured payments by method,
 * compute expected cash (opening float + cash sales) and the variance
 * against what the cashier actually counted.
 */
export async function closeStoreDayShift(input: {
  shiftId: string;
  countedCashCents: number;
  closeNote?: string;
  actorId: string;
}): Promise<CloseShiftResult> {
  const admin = createAdminClient();

  const { data: shift, error: shiftError } = await admin
    .from('cashier_shifts')
    .select('id, tenant_id, branch_id, opening_float_cents, status')
    .eq('id', input.shiftId)
    .maybeSingle();
  if (shiftError || !shift) throw shiftError ?? new Error('Shift not found');
  if (shift.status !== 'open') throw new Error('shift_already_closed');

  const totals = await sumPaymentsByMethod(input.shiftId);
  const expectedCashCents = shift.opening_float_cents + totals.cashCents;
  const varianceCents = input.countedCashCents - expectedCashCents;

  const { error: updateError } = await admin
    .from('cashier_shifts')
    .update({
      closed_at: new Date().toISOString(),
      expected_cash_cents: expectedCashCents,
      expected_card_cents: totals.cardCents,
      expected_wallet_cents: totals.walletCents,
      counted_cash_cents: input.countedCashCents,
      variance_cents: varianceCents,
      close_note: input.closeNote ?? null,
      status: 'closed',
    } as never)
    .eq('id', input.shiftId);
  if (updateError) throw updateError;

  await admin.from('activity_log').insert({
    tenant_id: shift.tenant_id,
    branch_id: shift.branch_id,
    actor_id: input.actorId,
    actor_role: 'staff',
    action: 'shift.closed',
    entity_type: 'cashier_shift',
    entity_id: input.shiftId,
    after: { expected_cash_cents: expectedCashCents, counted_cash_cents: input.countedCashCents, variance_cents: varianceCents },
  });

  return {
    expectedCashCents,
    expectedCardCents: totals.cardCents,
    expectedWalletCents: totals.walletCents,
    countedCashCents: input.countedCashCents,
    varianceCents,
  };
}

export async function getShiftSummary(shiftId: string): Promise<ShiftSummary> {
  const admin = createAdminClient();
  const totals = await sumPaymentsByMethod(shiftId);

  const [{ count: sessionCount }, { count: cartCount }] = await Promise.all([
    admin
      .from('payments')
      .select('id', { count: 'exact', head: true })
      .eq('shift_id', shiftId)
      .eq('status', 'captured')
      .eq('purpose', 'session'),
    admin.from('carts').select('id', { count: 'exact', head: true }).eq('shift_id', shiftId),
  ]);

  return {
    ...totals,
    sessionCount: sessionCount ?? 0,
    cartCount: cartCount ?? 0,
    totalCollectedCents: totals.cashCents + totals.cardCents + totals.walletCents,
  };
}
