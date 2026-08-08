'use server';

import { z } from 'zod';
import { requireRole } from '@/lib/auth';
import { phoneSchema } from '@/lib/validators/auth';
import { getWalletBalance } from '@/lib/wallet';
import { createAdminClient } from '@/lib/supabase/admin';
import { computeBowlingDuration } from '@/lib/bowling';
import {
  lookupCustomerByPhone,
  createWalkInCustomer,
  computeSessionPrice,
  computeSessionPriceForStation,
  startCashierSession,
} from '@/lib/cashier';
import { ensureShiftOpenForToday, closeStoreDayShift, getShiftSummary } from '@/lib/shifts';
import { endActiveSessionForStation, getActiveSessionsForBranch } from '@/lib/sessions';
import {
  openCart,
  getOpenCarts,
  getCart,
  removeCartItem,
  voidCart,
  settleCart,
  linkCustomerToCart,
  updateCartItemQuantity,
  applyCartDiscount,
  applyLineDiscount,
  clearCartDiscount,
} from '@/lib/carts';
import { searchInvoices, getLastInvoice, getInvoicePaymentBreakdown, getInvoiceById, issueCreditNote } from '@/lib/invoices';
import QRCode from 'qrcode';

const DEMO_TENANT_ID = '11111111-1111-1111-1111-111111111111';
const DEMO_BRANCH_ID_FALLBACK = '22222222-2222-2222-2222-222222222222';
const STAFF_ROLES = ['staff', 'manager', 'tenant_admin'] as const;

/** True if a game type's code marks it as bowling (players+games, not duration-based). */
async function isBowlingGameType(gameTypeId: string): Promise<boolean> {
  const admin = createAdminClient();
  const { data } = await admin.from('game_types').select('code').eq('id', gameTypeId).maybeSingle();
  return !!data?.code?.toLowerCase().includes('bowl');
}

// ---------------------------------------------------------------------
// Instant phone search + quick customer add
// ---------------------------------------------------------------------

const lookupSchema = z.object({ phone: phoneSchema });

export async function lookupCustomerAction(input: { phone: string }) {
  await requireRole(DEMO_TENANT_ID, [...STAFF_ROLES]);

  const parsed = lookupSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Invalid phone number' };
  }

  const customer = await lookupCustomerByPhone(parsed.data.phone);
  return { customer };
}

/**
 * Look up ANY customer by phone (not just the seated one) plus their wallet
 * balance — powers "pay from another wallet" at settlement. The cashier can
 * initiate this with just a phone number, but the caller (cart-panel.tsx)
 * must show the returned name + balance and get an explicit separate
 * confirm before actually charging it — a mistyped number must never
 * silently charge a stranger.
 */
export async function lookupWalletPayerAction(input: { phone: string }) {
  await requireRole(DEMO_TENANT_ID, [...STAFF_ROLES]);
  const parsed = lookupSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid phone number' };

  const customer = await lookupCustomerByPhone(parsed.data.phone);
  if (!customer) return { customer: null, balanceCents: null };
  const balanceCents = await getWalletBalance(DEMO_TENANT_ID, customer.id);
  return { customer, balanceCents };
}

const createWalkInSchema = z.object({
  phone: phoneSchema,
  fullName: z.string().trim().min(2, 'Name too short').max(80),
});

export async function createWalkInCustomerAction(input: { phone: string; fullName: string }) {
  await requireRole(DEMO_TENANT_ID, [...STAFF_ROLES]);

  const parsed = createWalkInSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  }

  try {
    const customer = await createWalkInCustomer(parsed.data);
    return { customer: { id: customer.id, full_name: parsed.data.fullName, phone: parsed.data.phone } };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Failed to create customer' };
  }
}

const computePriceSchema = z.object({
  gameTypeId: z.string().uuid(),
  durationMinutes: z.number().int().min(5).max(480),
  branchId: z.string().uuid(),
});

export async function computeSessionPriceAction(input: {
  gameTypeId: string;
  durationMinutes: number;
  branchId: string;
}) {
  await requireRole(DEMO_TENANT_ID, [...STAFF_ROLES]);

  const parsed = computePriceSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  }

  try {
    const amountCents = await computeSessionPrice(parsed.data);
    return { amountCents };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Failed to compute price' };
  }
}

const computePriceForStationSchema = z.object({
  stationId: z.string().uuid(),
  durationMinutes: z.number().int().min(5).max(480).optional(),
  playerCount: z.number().int().min(1).max(8).optional(),
  gameCount: z.union([z.literal(1), z.literal(2)]).optional(),
});

export async function computeSessionPriceForStationAction(input: {
  stationId: string;
  durationMinutes?: number;
  playerCount?: number;
  gameCount?: 1 | 2;
}) {
  await requireRole(DEMO_TENANT_ID, [...STAFF_ROLES]);

  const parsed = computePriceForStationSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  }

  try {
    const admin = createAdminClient();
    const { data: station } = await admin.from('stations').select('game_type_id').eq('id', parsed.data.stationId).maybeSingle();
    if (!station) return { error: 'Station not found' };

    let durationMinutes = parsed.data.durationMinutes;
    if (await isBowlingGameType(station.game_type_id)) {
      if (!parsed.data.playerCount || !parsed.data.gameCount) return { error: 'Player count and game count are required' };
      const computed = await computeBowlingDuration({
        tenantId: DEMO_TENANT_ID,
        gameTypeId: station.game_type_id,
        playerCount: parsed.data.playerCount,
        gameCount: parsed.data.gameCount,
      });
      durationMinutes = computed.durationMinutes;
    }
    if (!durationMinutes) return { error: 'Duration is required' };

    const amountCents = await computeSessionPriceForStation({
      stationId: parsed.data.stationId,
      durationMinutes,
      playerCount: parsed.data.playerCount,
      gameCount: parsed.data.gameCount,
    });
    return { amountCents, durationMinutes };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Failed to compute price' };
  }
}

const walletBalanceSchema = z.object({ customerId: z.string().uuid() });

export async function getCustomerWalletBalanceAction(input: { customerId: string }) {
  await requireRole(DEMO_TENANT_ID, [...STAFF_ROLES]);

  const parsed = walletBalanceSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Invalid customer id' };
  }

  const balanceCents = await getWalletBalance(DEMO_TENANT_ID, parsed.data.customerId);
  return { balanceCents };
}

const startSessionSchema = z.object({
  branchId: z.string().uuid(),
  stationId: z.string().uuid(),
  customerId: z.string().uuid(),
  customerLabel: z.string().trim().min(1).max(80),
  durationMinutes: z.number().int().min(5).max(480).optional(),
  playerCount: z.number().int().min(1).max(8).optional(),
  gameCount: z.union([z.literal(1), z.literal(2)]).optional(),
  paymentMethod: z.enum(['cash', 'wallet']).optional(),
  cartId: z.string().uuid().optional(),
});

export async function startCashierSessionAction(input: {
  branchId: string;
  stationId: string;
  customerId: string;
  customerLabel: string;
  durationMinutes?: number;
  playerCount?: number;
  gameCount?: 1 | 2;
  paymentMethod?: 'cash' | 'wallet';
  cartId?: string;
}) {
  const ctx = await requireRole(DEMO_TENANT_ID, [...STAFF_ROLES]);

  const parsed = startSessionSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  }
  if (!parsed.data.cartId && !parsed.data.paymentMethod) {
    return { error: 'Choose pay now or add to tab' };
  }

  try {
    const shift = await ensureShiftOpenForToday(DEMO_TENANT_ID, parsed.data.branchId, ctx.userId);
    if (!shift) return { error: 'no_open_shift' };

    const admin = createAdminClient();
    const { data: station } = await admin.from('stations').select('game_type_id').eq('id', parsed.data.stationId).maybeSingle();
    if (!station) return { error: 'Station not found' };

    let durationMinutes = parsed.data.durationMinutes;
    let predictedDurationMinutes: number | undefined;
    if (await isBowlingGameType(station.game_type_id)) {
      if (!parsed.data.playerCount || !parsed.data.gameCount) return { error: 'Player count and game count are required' };
      const computed = await computeBowlingDuration({
        tenantId: DEMO_TENANT_ID,
        gameTypeId: station.game_type_id,
        playerCount: parsed.data.playerCount,
        gameCount: parsed.data.gameCount,
      });
      durationMinutes = computed.durationMinutes;
      predictedDurationMinutes = computed.predicted;
    }
    if (!durationMinutes) return { error: 'Duration is required' };

    const result = await startCashierSession({
      tenantId: DEMO_TENANT_ID,
      branchId: parsed.data.branchId,
      stationId: parsed.data.stationId,
      customerId: parsed.data.customerId,
      customerLabel: parsed.data.customerLabel,
      durationMinutes,
      paymentMethod: parsed.data.paymentMethod,
      actorId: ctx.userId,
      shiftId: shift.id,
      cartId: parsed.data.cartId,
      playerCount: parsed.data.playerCount,
      gameCount: parsed.data.gameCount,
      predictedDurationMinutes,
    });
    return { result };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Failed to start session' };
  }
}

// ---------------------------------------------------------------------
// Running sessions — end from the same screen (PART 3)
// ---------------------------------------------------------------------

export async function getActiveSessionsAction(input: { branchId: string }) {
  await requireRole(DEMO_TENANT_ID, [...STAFF_ROLES]);
  try {
    const sessions = await getActiveSessionsForBranch(DEMO_TENANT_ID, input.branchId);
    return { sessions };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Failed to load active sessions' };
  }
}

const endSessionSchema = z.object({ stationId: z.string().uuid() });

/**
 * Ends the running session on a station. Staff-only — enforced here via
 * requireRole (same gate every other cashier action uses), not just hidden
 * behind a UI button, so a customer-facing surface could never reach this.
 */
export async function endSessionAction(input: { stationId: string }) {
  const ctx = await requireRole(DEMO_TENANT_ID, [...STAFF_ROLES]);
  const parsed = endSessionSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' };

  try {
    const admin = createAdminClient();
    const { data: station } = await admin.from('stations').select('branch_id').eq('id', parsed.data.stationId).maybeSingle();
    if (!station) return { error: 'Station not found' };

    const result = await endActiveSessionForStation({
      stationId: parsed.data.stationId,
      tenantId: DEMO_TENANT_ID,
      branchId: station.branch_id,
      endedBy: ctx.userId,
    });
    return { result };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Failed to end session' };
  }
}

// ---------------------------------------------------------------------
// Shifts
// ---------------------------------------------------------------------

/**
 * Ensures today's store-day shift exists (auto-opening it on first use) and
 * returns it. Returns `shift: null` if today's store-day was already closed
 * — the UI shows "store day closed" rather than a broken "open shift" flow,
 * since there is no manual open step anymore (see PART 4 of the cashier
 * reshape).
 */
export async function getOpenShiftAction(input: { branchId: string }) {
  const ctx = await requireRole(DEMO_TENANT_ID, [...STAFF_ROLES]);
  try {
    const shift = await ensureShiftOpenForToday(DEMO_TENANT_ID, input.branchId, ctx.userId);
    return { shift };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Failed to load shift' };
  }
}

const closeShiftSchema = z.object({
  shiftId: z.string().uuid(),
  countedCashCents: z.number().int().min(0).max(50_000_000),
  closeNote: z.string().trim().max(500).optional(),
});

export async function closeShiftAction(input: { shiftId: string; countedCashCents: number; closeNote?: string }) {
  const ctx = await requireRole(DEMO_TENANT_ID, [...STAFF_ROLES]);
  const parsed = closeShiftSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' };

  try {
    const result = await closeStoreDayShift({ ...parsed.data, actorId: ctx.userId });
    return { result };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Failed to close shift' };
  }
}

export async function getShiftSummaryAction(input: { shiftId: string }) {
  await requireRole(DEMO_TENANT_ID, [...STAFF_ROLES]);
  try {
    const summary = await getShiftSummary(input.shiftId);
    return { summary };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Failed to load shift summary' };
  }
}

// ---------------------------------------------------------------------
// Carts (cart === tab; a cart settled immediately IS a "pay now" checkout)
// ---------------------------------------------------------------------

const openCartSchema = z.object({
  branchId: z.string().uuid(),
  customerId: z.string().uuid().optional(),
  label: z.string().trim().max(80).optional(),
});

export async function openCartAction(input: { branchId: string; customerId?: string; label?: string }) {
  const ctx = await requireRole(DEMO_TENANT_ID, [...STAFF_ROLES]);
  const parsed = openCartSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' };

  try {
    const shift = await ensureShiftOpenForToday(DEMO_TENANT_ID, parsed.data.branchId, ctx.userId);
    if (!shift) return { error: 'no_open_shift' };

    const result = await openCart({
      tenantId: DEMO_TENANT_ID,
      branchId: parsed.data.branchId,
      shiftId: shift.id,
      openedBy: ctx.userId,
      customerId: parsed.data.customerId,
      label: parsed.data.label,
    });
    return { result };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Failed to open cart' };
  }
}

export async function getOpenCartsAction(input: { branchId: string }) {
  await requireRole(DEMO_TENANT_ID, [...STAFF_ROLES]);
  try {
    const carts = await getOpenCarts(DEMO_TENANT_ID, input.branchId);
    return { carts };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Failed to load carts' };
  }
}

export async function getCartAction(input: { cartId: string }) {
  await requireRole(DEMO_TENANT_ID, [...STAFF_ROLES]);
  try {
    const cart = await getCart(input.cartId);
    return { cart };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Failed to load cart' };
  }
}

const removeCartItemSchema = z.object({ cartItemId: z.string().uuid() });

export async function removeCartItemAction(input: { cartItemId: string }) {
  const ctx = await requireRole(DEMO_TENANT_ID, [...STAFF_ROLES]);
  const parsed = removeCartItemSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' };

  try {
    await removeCartItem(parsed.data.cartItemId, ctx.userId);
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Failed to remove item' };
  }
}

const linkCustomerSchema = z.object({ cartId: z.string().uuid(), customerId: z.string().uuid() });

export async function linkCustomerToCartAction(input: { cartId: string; customerId: string }) {
  const ctx = await requireRole(DEMO_TENANT_ID, [...STAFF_ROLES]);
  const parsed = linkCustomerSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' };

  try {
    await linkCustomerToCart(parsed.data.cartId, parsed.data.customerId, ctx.userId);
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Failed to link customer' };
  }
}

const voidCartSchema = z.object({ cartId: z.string().uuid(), reason: z.string().trim().min(1).max(200) });

export async function voidCartAction(input: { cartId: string; reason: string }) {
  const ctx = await requireRole(DEMO_TENANT_ID, [...STAFF_ROLES]);
  const parsed = voidCartSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' };

  try {
    await voidCart(parsed.data.cartId, parsed.data.reason, ctx.userId);
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Failed to void cart' };
  }
}

const settleCartSchema = z.object({
  cartId: z.string().uuid(),
  payments: z
    .array(
      z.object({
        method: z.enum(['cash', 'card', 'wallet']),
        amountCents: z.number().int().positive(),
        cardReference: z.string().trim().max(80).optional(),
        payerCustomerId: z.string().uuid().optional(),
      })
    )
    .min(1),
});

export async function settleCartAction(input: {
  cartId: string;
  payments: Array<{ method: 'cash' | 'card' | 'wallet'; amountCents: number; cardReference?: string; payerCustomerId?: string }>;
}) {
  const ctx = await requireRole(DEMO_TENANT_ID, [...STAFF_ROLES]);
  const parsed = settleCartSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' };

  try {
    const result = await settleCart({ cartId: parsed.data.cartId, payments: parsed.data.payments, actorId: ctx.userId });
    return { result };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Failed to settle cart' };
  }
}

// ---------------------------------------------------------------------
// Line-item editing (Prompt 2)
// ---------------------------------------------------------------------

const updateQuantitySchema = z.object({ cartItemId: z.string().uuid(), quantity: z.number().int().min(1).max(999) });

export async function updateCartItemQuantityAction(input: { cartItemId: string; quantity: number }) {
  const ctx = await requireRole(DEMO_TENANT_ID, [...STAFF_ROLES]);
  const parsed = updateQuantitySchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' };

  try {
    await updateCartItemQuantity(parsed.data.cartItemId, parsed.data.quantity, ctx.userId);
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Failed to update quantity' };
  }
}

// ---------------------------------------------------------------------
// Ad-hoc discounts (Prompt 2)
// ---------------------------------------------------------------------

const discountSchema = z.object({ type: z.enum(['flat', 'percent']), value: z.number().min(0).max(1_000_000) });

const applyCartDiscountSchema = z.object({ cartId: z.string().uuid() }).merge(discountSchema);

export async function applyCartDiscountAction(input: { cartId: string; type: 'flat' | 'percent'; value: number }) {
  const ctx = await requireRole(DEMO_TENANT_ID, [...STAFF_ROLES]);
  const parsed = applyCartDiscountSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' };

  try {
    await applyCartDiscount({ cartId: parsed.data.cartId, type: parsed.data.type, value: parsed.data.value, actorId: ctx.userId });
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Failed to apply discount' };
  }
}

const applyLineDiscountSchema = z.object({ cartItemId: z.string().uuid() }).merge(discountSchema);

export async function applyLineDiscountAction(input: { cartItemId: string; type: 'flat' | 'percent'; value: number }) {
  const ctx = await requireRole(DEMO_TENANT_ID, [...STAFF_ROLES]);
  const parsed = applyLineDiscountSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' };

  try {
    await applyLineDiscount({ cartItemId: parsed.data.cartItemId, type: parsed.data.type, value: parsed.data.value, actorId: ctx.userId });
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Failed to apply discount' };
  }
}

const clearCartDiscountSchema = z.object({ cartId: z.string().uuid() });

export async function clearCartDiscountAction(input: { cartId: string }) {
  const ctx = await requireRole(DEMO_TENANT_ID, [...STAFF_ROLES]);
  const parsed = clearCartDiscountSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' };

  try {
    await clearCartDiscount(parsed.data.cartId, ctx.userId);
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Failed to clear discount' };
  }
}

// ---------------------------------------------------------------------
// Invoice search / history + reprint (Prompt 2)
// ---------------------------------------------------------------------

const searchInvoicesSchema = z.object({
  branchId: z.string().uuid(),
  query: z.string().trim().max(80).optional(),
  shiftId: z.string().uuid().optional(),
});

export async function searchInvoicesAction(input: { branchId: string; query?: string; shiftId?: string }) {
  await requireRole(DEMO_TENANT_ID, [...STAFF_ROLES]);
  const parsed = searchInvoicesSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' };

  try {
    const invoices = await searchInvoices({ tenantId: DEMO_TENANT_ID, branchId: parsed.data.branchId, query: parsed.data.query, shiftId: parsed.data.shiftId });
    return { invoices };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Failed to search invoices' };
  }
}

export async function getLastInvoiceAction(input: { branchId: string; shiftId?: string }) {
  await requireRole(DEMO_TENANT_ID, [...STAFF_ROLES]);
  try {
    const invoice = await getLastInvoice(DEMO_TENANT_ID, input.branchId, input.shiftId);
    if (!invoice) return { invoice: null };
    const paymentBreakdown = await getInvoicePaymentBreakdown(invoice);
    return { invoice, paymentBreakdown };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Failed to load last invoice' };
  }
}

export async function getInvoiceForReceiptAction(input: { invoiceId: string }) {
  await requireRole(DEMO_TENANT_ID, [...STAFF_ROLES]);
  try {
    const invoice = await getInvoiceById(input.invoiceId, DEMO_TENANT_ID);
    if (!invoice) return { error: 'Invoice not found' };
    const paymentBreakdown = await getInvoicePaymentBreakdown(invoice);
    const qrDataUrl = await QRCode.toDataURL(invoice.qr_tlv_base64, { margin: 1, width: 220 });
    return { invoice, paymentBreakdown, qrDataUrl };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Failed to load invoice' };
  }
}

/** Invoice for a session that's already been paid, if one exists — sessions still open on a tab have none yet. */
export async function getInvoiceForSessionAction(input: { sessionId: string }) {
  await requireRole(DEMO_TENANT_ID, [...STAFF_ROLES]);
  try {
    const admin = createAdminClient();
    const { data: payment } = await admin.from('payments').select('id').eq('session_id', input.sessionId).eq('status', 'captured').maybeSingle();
    if (!payment) return { invoiceId: null };
    const { data: invoice } = await admin.from('invoices').select('id').eq('source_payment_id', payment.id).maybeSingle();
    return { invoiceId: invoice?.id ?? null };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Failed to look up invoice' };
  }
}

const issueCreditNoteSchema = z.object({ invoiceId: z.string().uuid() });

/**
 * Basic refund/return stub: wires to the existing credit-note mechanism
 * (issueCreditNote) — a full immutable credit note reversing the original
 * invoice's amounts. NOT a partial refund and doesn't touch wallet/cash —
 * that's a bigger feature than this prompt covers; flagged in the summary.
 */
export async function issueCreditNoteFromCashierAction(input: { invoiceId: string }) {
  const ctx = await requireRole(DEMO_TENANT_ID, [...STAFF_ROLES]);
  const parsed = issueCreditNoteSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' };

  try {
    const result = await issueCreditNote({
      tenantId: DEMO_TENANT_ID,
      branchId: DEMO_BRANCH_ID_FALLBACK,
      originalInvoiceId: parsed.data.invoiceId,
      issuedBy: ctx.userId,
    });
    return { result };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Failed to issue credit note' };
  }
}
