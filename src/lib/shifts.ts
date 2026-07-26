import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';

export interface Shift {
  id: string;
  openedAt: string;
  openingFloatCents: number;
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

/**
 * Open a new cashier shift. Rejects if this cashier already has one open on
 * this branch — the partial unique index on cashier_shifts also enforces
 * this at the DB level, so a race just surfaces as a duplicate-key error.
 */
export async function openShift(input: {
  tenantId: string;
  branchId: string;
  cashierId: string;
  openingFloatCents: number;
}): Promise<{ shiftId: string }> {
  const admin = createAdminClient();

  const existing = await getOpenShift(input.tenantId, input.branchId, input.cashierId);
  if (existing) throw new Error('shift_already_open');

  const { data, error } = await admin
    .from('cashier_shifts')
    .insert({
      tenant_id: input.tenantId,
      branch_id: input.branchId,
      cashier_id: input.cashierId,
      opening_float_cents: input.openingFloatCents,
    } as never)
    .select('id')
    .single();
  if (error || !data) throw error ?? new Error('Failed to open shift');

  await admin.from('activity_log').insert({
    tenant_id: input.tenantId,
    branch_id: input.branchId,
    actor_id: input.cashierId,
    actor_role: 'staff',
    action: 'shift.opened',
    entity_type: 'cashier_shift',
    entity_id: data.id,
    after: { opening_float_cents: input.openingFloatCents },
  });

  return { shiftId: data.id };
}

export async function getOpenShift(tenantId: string, branchId: string, cashierId: string): Promise<Shift | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('cashier_shifts')
    .select('id, opened_at, opening_float_cents, status')
    .eq('tenant_id', tenantId)
    .eq('branch_id', branchId)
    .eq('cashier_id', cashierId)
    .eq('status', 'open')
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    id: data.id,
    openedAt: data.opened_at,
    openingFloatCents: data.opening_float_cents,
    status: data.status as 'open' | 'closed',
  };
}

/**
 * Close a shift: sum this shift's captured payments by method, compute
 * expected cash (opening float + cash sales) and the variance against what
 * the cashier actually counted.
 */
export async function closeShift(input: {
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
