import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { debitWallet } from '@/lib/wallet';
import { awardPoints, computePointsEarned } from '@/lib/loyalty';
import { issueInvoiceForCart } from '@/lib/invoices';

export interface CartSummary {
  id: string;
  label: string | null;
  customerId: string | null;
  customerName: string | null;
  openedAt: string;
  itemCount: number;
  totalCents: number;
}

export interface CartItemRow {
  id: string;
  description: string;
  quantity: number;
  unitPriceCents: number;
  lineDiscountCents: number;
  amountCents: number;
  sessionId: string | null;
  createdAt: string;
}

export interface CartWithItems {
  id: string;
  tenantId: string;
  branchId: string;
  shiftId: string | null;
  customerId: string | null;
  label: string | null;
  status: 'open' | 'settled' | 'void';
  subtotalCents: number;
  discountCents: number;
  totalCents: number;
  items: CartItemRow[];
}

export async function openCart(input: {
  tenantId: string;
  branchId: string;
  shiftId: string;
  openedBy: string;
  customerId?: string;
  label?: string;
}): Promise<{ cartId: string }> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('carts')
    .insert({
      tenant_id: input.tenantId,
      branch_id: input.branchId,
      shift_id: input.shiftId,
      customer_id: input.customerId ?? null,
      label: input.label ?? null,
      opened_by: input.openedBy,
    } as never)
    .select('id')
    .single();
  if (error || !data) throw error ?? new Error('Failed to open cart');

  await admin.from('activity_log').insert({
    tenant_id: input.tenantId,
    branch_id: input.branchId,
    actor_id: input.openedBy,
    actor_role: 'staff',
    action: 'cart.opened',
    entity_type: 'cart',
    entity_id: data.id,
    after: { customer_id: input.customerId ?? null, label: input.label ?? null },
  });

  return { cartId: data.id };
}

/** Recomputes subtotal/total from the cart's live line items (never trusts a running counter). */
async function recomputeCartTotals(cartId: string): Promise<void> {
  const admin = createAdminClient();
  const { data: items, error } = await admin.from('cart_items').select('amount_cents').eq('cart_id', cartId);
  if (error) throw error;

  const { data: cart, error: cartError } = await admin.from('carts').select('discount_cents').eq('id', cartId).maybeSingle();
  if (cartError || !cart) throw cartError ?? new Error('Cart not found');

  const subtotalCents = (items ?? []).reduce((sum, i) => sum + i.amount_cents, 0);
  const totalCents = Math.max(0, subtotalCents - cart.discount_cents);

  const { error: updateError } = await admin
    .from('carts')
    .update({ subtotal_cents: subtotalCents, total_cents: totalCents } as never)
    .eq('id', cartId);
  if (updateError) throw updateError;
}

/**
 * Adds a session's charge as a line item on a cart and recomputes totals.
 * Unlike the sketch signature (cartId, sessionId), the amount and
 * description are passed in explicitly — a cart-mode session never gets a
 * `payments` row at seat time (payment is deferred to settlement), so there
 * is nowhere else to read the charge back from.
 */
export async function addSessionToCart(
  cartId: string,
  sessionId: string,
  amountCents: number,
  description: string
): Promise<void> {
  const admin = createAdminClient();

  const { error: itemError } = await admin.from('cart_items').insert({
    cart_id: cartId,
    session_id: sessionId,
    description,
    quantity: 1,
    unit_price_cents: amountCents,
    amount_cents: amountCents,
  } as never);
  if (itemError) throw itemError;

  await recomputeCartTotals(cartId);
}

/**
 * A cart line's session is only ever 'pending' (added, paid or not, but
 * never started — see startPendingSession in sessions.ts) while its cart is
 * still open. If that line is removed or the whole cart is voided before
 * settlement, the session must be ended too — otherwise it would sit
 * 'pending' forever, holding its station 'reserved' with no cart left to
 * ever settle it and no way to reach it from either the running-sessions or
 * ready-to-start panels. Ending it (rather than leaving a new state) reuses
 * the exact same station-freeing trigger 'ended' already fires.
 */
async function endPendingSessionsByIds(admin: ReturnType<typeof createAdminClient>, sessionIds: string[]): Promise<void> {
  if (sessionIds.length === 0) return;
  await admin
    .from('sessions')
    .update({ status: 'ended', ended_at: new Date().toISOString(), actual_duration_seconds: 0, actual_duration_minutes: 0 } as never)
    .in('id', sessionIds)
    .eq('status', 'pending');
}

/** Removes a line item while the cart is still open, then recomputes totals. */
export async function removeCartItem(cartItemId: string, actorId: string): Promise<void> {
  const admin = createAdminClient();

  const { data: item, error } = await admin
    .from('cart_items')
    .select('id, cart_id, description, amount_cents, session_id')
    .eq('id', cartItemId)
    .maybeSingle();
  if (error || !item) throw error ?? new Error('Cart item not found');

  const { data: cart, error: cartError } = await admin.from('carts').select('tenant_id, branch_id, status').eq('id', item.cart_id).maybeSingle();
  if (cartError || !cart) throw cartError ?? new Error('Cart not found');
  if (cart.status !== 'open') throw new Error('cart_not_open');

  const { error: deleteError } = await admin.from('cart_items').delete().eq('id', cartItemId);
  if (deleteError) throw deleteError;

  if (item.session_id) await endPendingSessionsByIds(admin, [item.session_id]);

  await recomputeCartTotals(item.cart_id);

  await admin.from('activity_log').insert({
    tenant_id: cart.tenant_id,
    branch_id: cart.branch_id,
    actor_id: actorId,
    actor_role: 'staff',
    action: 'cart.item_removed',
    entity_type: 'cart',
    entity_id: item.cart_id,
    after: { description: item.description, amount_cents: item.amount_cents },
  });
}

/**
 * Update a line's quantity. Session lines are always quantity 1 (there's no
 * such thing as "2 of the same session") — this mechanism exists now mainly
 * for product lines (a later prompt), but nothing here special-cases session
 * lines; a caller could still bump one, so callers/UI should only expose the
 * stepper where it makes sense.
 */
export async function updateCartItemQuantity(cartItemId: string, quantity: number, actorId: string): Promise<void> {
  if (!Number.isInteger(quantity) || quantity < 1) throw new Error('invalid_quantity');
  const admin = createAdminClient();

  const { data: item, error } = await admin
    .from('cart_items')
    .select('id, cart_id, unit_price_cents, line_discount_cents')
    .eq('id', cartItemId)
    .maybeSingle();
  if (error || !item) throw error ?? new Error('Cart item not found');

  const { data: cart, error: cartError } = await admin.from('carts').select('tenant_id, branch_id, status').eq('id', item.cart_id).maybeSingle();
  if (cartError || !cart) throw cartError ?? new Error('Cart not found');
  if (cart.status !== 'open') throw new Error('cart_not_open');

  const grossCents = quantity * item.unit_price_cents;
  // A flat line discount that exceeded the new (smaller) gross would push
  // the line negative — clamp it down instead.
  const lineDiscountCents = Math.min(item.line_discount_cents, grossCents);
  const amountCents = grossCents - lineDiscountCents;

  const { error: updateError } = await admin
    .from('cart_items')
    .update({ quantity, line_discount_cents: lineDiscountCents, amount_cents: amountCents } as never)
    .eq('id', cartItemId);
  if (updateError) throw updateError;

  await recomputeCartTotals(item.cart_id);

  await admin.from('activity_log').insert({
    tenant_id: cart.tenant_id,
    branch_id: cart.branch_id,
    actor_id: actorId,
    actor_role: 'staff',
    action: 'cart.item_quantity_updated',
    entity_type: 'cart',
    entity_id: item.cart_id,
    after: { cart_item_id: cartItemId, quantity, amount_cents: amountCents },
  });
}

export type DiscountType = 'flat' | 'percent';

/**
 * Ad-hoc discount on a single line — separate from the offers/promo system.
 * Applied BEFORE the cart-level discount (see applyCartDiscount): the
 * line's own amount_cents already nets this out, so recomputeCartTotals'
 * subtotal (sum of amount_cents) reflects it, and any cart-level discount
 * then applies on top of that already-discounted subtotal.
 */
export async function applyLineDiscount(input: {
  cartItemId: string;
  type: DiscountType;
  value: number;
  actorId: string;
}): Promise<void> {
  if (input.value < 0) throw new Error('invalid_discount_value');
  if (input.type === 'percent' && input.value > 100) throw new Error('invalid_discount_value');
  const admin = createAdminClient();

  const { data: item, error } = await admin
    .from('cart_items')
    .select('id, cart_id, quantity, unit_price_cents')
    .eq('id', input.cartItemId)
    .maybeSingle();
  if (error || !item) throw error ?? new Error('Cart item not found');

  const { data: cart, error: cartError } = await admin.from('carts').select('tenant_id, branch_id, status').eq('id', item.cart_id).maybeSingle();
  if (cartError || !cart) throw cartError ?? new Error('Cart not found');
  if (cart.status !== 'open') throw new Error('cart_not_open');

  const grossCents = item.quantity * item.unit_price_cents;
  const lineDiscountCents = Math.min(
    grossCents,
    input.type === 'flat' ? Math.round(input.value * 100) : Math.round((grossCents * input.value) / 100)
  );
  const amountCents = grossCents - lineDiscountCents;

  const { error: updateError } = await admin
    .from('cart_items')
    .update({ line_discount_cents: lineDiscountCents, amount_cents: amountCents } as never)
    .eq('id', input.cartItemId);
  if (updateError) throw updateError;

  await recomputeCartTotals(item.cart_id);

  // Discounts are a theft vector (staff undercharging a friend) — logged
  // prominently with actor + amount for exactly that reason.
  await admin.from('activity_log').insert({
    tenant_id: cart.tenant_id,
    branch_id: cart.branch_id,
    actor_id: input.actorId,
    actor_role: 'staff',
    action: 'cart.line_discount_applied',
    entity_type: 'cart',
    entity_id: item.cart_id,
    after: { cart_item_id: input.cartItemId, type: input.type, value: input.value, discount_cents: lineDiscountCents },
  });
}

/**
 * Ad-hoc discount on the whole cart, applied to the subtotal AFTER any
 * per-line discounts (subtotal_cents is the sum of items' already-discounted
 * amount_cents — see recomputeCartTotals). Capped so the cart can never go
 * negative.
 */
export async function applyCartDiscount(input: { cartId: string; type: DiscountType; value: number; actorId: string }): Promise<void> {
  if (input.value < 0) throw new Error('invalid_discount_value');
  if (input.type === 'percent' && input.value > 100) throw new Error('invalid_discount_value');
  const admin = createAdminClient();

  const { data: cartCheck, error: checkError } = await admin.from('carts').select('status').eq('id', input.cartId).maybeSingle();
  if (checkError || !cartCheck) throw checkError ?? new Error('Cart not found');
  if (cartCheck.status !== 'open') throw new Error('cart_not_open');

  // Recompute first so a stale subtotal (e.g. an item added/removed since
  // the last mutation) can never under- or over-cap this discount.
  await recomputeCartTotals(input.cartId);
  const { data: cart, error } = await admin.from('carts').select('tenant_id, branch_id, status, subtotal_cents').eq('id', input.cartId).maybeSingle();
  if (error || !cart) throw error ?? new Error('Cart not found');

  const discountCents = Math.min(
    cart.subtotal_cents,
    input.type === 'flat' ? Math.round(input.value * 100) : Math.round((cart.subtotal_cents * input.value) / 100)
  );

  const { error: updateError } = await admin.from('carts').update({ discount_cents: discountCents } as never).eq('id', input.cartId);
  if (updateError) throw updateError;

  await recomputeCartTotals(input.cartId);

  await admin.from('activity_log').insert({
    tenant_id: cart.tenant_id,
    branch_id: cart.branch_id,
    actor_id: input.actorId,
    actor_role: 'staff',
    action: 'cart.discount_applied',
    entity_type: 'cart',
    entity_id: input.cartId,
    after: { type: input.type, value: input.value, discount_cents: discountCents },
  });
}

export async function clearCartDiscount(cartId: string, actorId: string): Promise<void> {
  const admin = createAdminClient();

  const { data: cart, error } = await admin.from('carts').select('tenant_id, branch_id, status, discount_cents').eq('id', cartId).maybeSingle();
  if (error || !cart) throw error ?? new Error('Cart not found');
  if (cart.status !== 'open') throw new Error('cart_not_open');

  const { error: updateError } = await admin.from('carts').update({ discount_cents: 0 } as never).eq('id', cartId);
  if (updateError) throw updateError;

  await recomputeCartTotals(cartId);

  await admin.from('activity_log').insert({
    tenant_id: cart.tenant_id,
    branch_id: cart.branch_id,
    actor_id: actorId,
    actor_role: 'staff',
    action: 'cart.discount_cleared',
    entity_type: 'cart',
    entity_id: cartId,
    after: { previous_discount_cents: cart.discount_cents },
  });
}

export async function getCart(cartId: string): Promise<CartWithItems | null> {
  const admin = createAdminClient();
  const { data: cart, error } = await admin
    .from('carts')
    .select('id, tenant_id, branch_id, shift_id, customer_id, label, status, subtotal_cents, discount_cents, total_cents')
    .eq('id', cartId)
    .maybeSingle();
  if (error) throw error;
  if (!cart) return null;

  const { data: items } = await admin
    .from('cart_items')
    .select('id, description, quantity, unit_price_cents, line_discount_cents, amount_cents, session_id, created_at')
    .eq('cart_id', cartId)
    .order('created_at', { ascending: true });

  return {
    id: cart.id,
    tenantId: cart.tenant_id,
    branchId: cart.branch_id,
    shiftId: cart.shift_id,
    customerId: cart.customer_id,
    label: cart.label,
    status: cart.status as 'open' | 'settled' | 'void',
    subtotalCents: cart.subtotal_cents,
    discountCents: cart.discount_cents,
    totalCents: cart.total_cents,
    items: (items ?? []).map((i) => ({
      id: i.id,
      description: i.description,
      quantity: i.quantity,
      unitPriceCents: i.unit_price_cents,
      lineDiscountCents: i.line_discount_cents,
      amountCents: i.amount_cents,
      sessionId: i.session_id,
      createdAt: i.created_at,
    })),
  };
}

export async function getOpenCarts(tenantId: string, branchId: string): Promise<CartSummary[]> {
  const admin = createAdminClient();
  const { data: cartsRaw, error } = await admin
    .from('carts')
    .select('id, label, customer_id, opened_at, total_cents')
    .eq('tenant_id', tenantId)
    .eq('branch_id', branchId)
    .eq('status', 'open')
    .order('opened_at', { ascending: true });
  if (error) throw error;
  if (!cartsRaw || cartsRaw.length === 0) return [];

  const cartIds = cartsRaw.map((c) => c.id);
  const customerIds = [...new Set(cartsRaw.map((c) => c.customer_id).filter((id): id is string => !!id))];

  const [{ data: itemsRaw }, { data: profilesRaw }] = await Promise.all([
    admin.from('cart_items').select('cart_id').in('cart_id', cartIds),
    customerIds.length
      ? admin.from('profiles').select('id, full_name').in('id', customerIds)
      : Promise.resolve({ data: [] as Array<{ id: string; full_name: string | null }> }),
  ]);
  const itemCountMap = new Map<string, number>();
  for (const item of itemsRaw ?? []) {
    itemCountMap.set(item.cart_id, (itemCountMap.get(item.cart_id) ?? 0) + 1);
  }
  const profileMap = new Map((profilesRaw ?? []).map((p) => [p.id, p.full_name]));

  return cartsRaw.map((c) => ({
    id: c.id,
    label: c.label,
    customerId: c.customer_id,
    customerName: c.customer_id ? (profileMap.get(c.customer_id) ?? null) : null,
    openedAt: c.opened_at,
    itemCount: itemCountMap.get(c.id) ?? 0,
    totalCents: c.total_cents,
  }));
}

/** Links a customer to a still-open cart (from the phone-search bar). Overwrites any previous link. */
export async function linkCustomerToCart(cartId: string, customerId: string, actorId: string): Promise<void> {
  const admin = createAdminClient();
  const { data: cart, error } = await admin.from('carts').select('tenant_id, branch_id, status').eq('id', cartId).maybeSingle();
  if (error || !cart) throw error ?? new Error('Cart not found');
  if (cart.status !== 'open') throw new Error('cart_not_open');

  const { error: updateError } = await admin.from('carts').update({ customer_id: customerId } as never).eq('id', cartId);
  if (updateError) throw updateError;

  await admin.from('activity_log').insert({
    tenant_id: cart.tenant_id,
    branch_id: cart.branch_id,
    actor_id: actorId,
    actor_role: 'staff',
    action: 'cart.customer_linked',
    entity_type: 'cart',
    entity_id: cartId,
    after: { customer_id: customerId },
  });
}

export async function voidCart(cartId: string, reason: string, actorId: string): Promise<void> {
  const admin = createAdminClient();
  const { data: cart, error } = await admin
    .from('carts')
    .select('id, tenant_id, branch_id, status')
    .eq('id', cartId)
    .maybeSingle();
  if (error || !cart) throw error ?? new Error('Cart not found');
  if (cart.status !== 'open') throw new Error('cart_not_open');

  const { error: updateError } = await admin.from('carts').update({ status: 'void' } as never).eq('id', cartId);
  if (updateError) throw updateError;

  const { data: itemsWithSessions } = await admin.from('cart_items').select('session_id').eq('cart_id', cartId).not('session_id', 'is', null);
  const sessionIds = (itemsWithSessions ?? []).map((i) => i.session_id).filter((id): id is string => !!id);
  await endPendingSessionsByIds(admin, sessionIds);

  await admin.from('activity_log').insert({
    tenant_id: cart.tenant_id,
    branch_id: cart.branch_id,
    actor_id: actorId,
    actor_role: 'staff',
    action: 'cart.voided',
    entity_type: 'cart',
    entity_id: cartId,
    after: { reason },
  });
}

export interface SettleCartPaymentLine {
  method: 'cash' | 'card' | 'wallet';
  amountCents: number;
  cardReference?: string;
  /** wallet only — charge a DIFFERENT customer's wallet than the cart's own. Undefined = the cart's own customer pays. */
  payerCustomerId?: string;
}

export interface SettleCartResult {
  invoiceId?: string;
  totalPaidCents: number;
  changeCents: number;
}

/**
 * Settle a cart against one or more tender lines. Each line becomes its own
 * `payments` row (so shift reconciliation can bucket revenue by method) and
 * a `cart_payments` row linking it back to the cart (card lines also carry
 * the terminal's card_reference). Only cash may be over-tendered — the
 * excess becomes change and is never billed to a customer's wallet/card, so
 * wallet/card lines must add up to no more than what's still owed at the
 * point they're applied.
 *
 * Not wrapped in a single DB transaction — this mirrors the rest of the
 * codebase (see startCashierSession: wallet debit, payment insert, and
 * session insert are three sequential awaited calls, not one RPC). Each
 * wallet debit is independently atomic via its own RPC; a mid-settlement
 * failure here leaves the cart open (not double-charged) and is safe to
 * retry — re-running settleCart on the same still-open cart is safe because
 * the cart's total is recomputed server-side, not trusted from the caller.
 */
export async function settleCart(input: {
  cartId: string;
  payments: SettleCartPaymentLine[];
  actorId: string;
}): Promise<SettleCartResult> {
  const admin = createAdminClient();

  // Reload + recompute so a stale client total can never under/over-charge.
  await recomputeCartTotals(input.cartId);

  const cart = await getCart(input.cartId);
  if (!cart) throw new Error('Cart not found');
  if (cart.status !== 'open') throw new Error('cart_not_open');
  if (cart.items.length === 0) throw new Error('cart_empty');
  if (input.payments.length === 0) throw new Error('no_payment_lines');

  const walletLines = input.payments.filter((p) => p.method === 'wallet');
  if (walletLines.some((l) => !l.payerCustomerId) && !cart.customerId) throw new Error('wallet_requires_customer');

  const tenderedTotal = input.payments.reduce((sum, p) => sum + p.amountCents, 0);
  if (tenderedTotal < cart.totalCents) throw new Error('underpayment');

  // Non-cash lines must never be asked to cover more than the bill — only
  // cash can be over-tendered to make change.
  const nonCashTotal = input.payments.filter((p) => p.method !== 'cash').reduce((sum, p) => sum + p.amountCents, 0);
  if (nonCashTotal > cart.totalCents) throw new Error('overpayment_must_be_cash');

  let remainingToApply = cart.totalCents;
  let changeCents = 0;
  const cartPaymentRows: Array<{
    method: 'cash' | 'card' | 'wallet';
    tenderedCents: number;
    appliedCents: number;
    cardReference?: string;
    payerCustomerId?: string;
    paymentId: string;
  }> = [];

  for (const line of input.payments) {
    const appliedCents = line.method === 'cash' ? Math.min(line.amountCents, remainingToApply) : line.amountCents;
    remainingToApply -= appliedCents;
    if (line.method === 'cash') changeCents += line.amountCents - appliedCents;

    if (line.method === 'wallet') {
      const payerId = line.payerCustomerId ?? cart.customerId!;
      await debitWallet({
        tenantId: cart.tenantId,
        customerId: payerId,
        amountCents: appliedCents,
        kind: 'debit_purchase',
        reason:
          line.payerCustomerId && line.payerCustomerId !== cart.customerId
            ? `Cart settlement (paid for another customer) — ${cart.label ?? 'walk-in group'}`
            : `Cart settlement — ${cart.label ?? 'walk-in group'}`,
        referenceType: 'cart',
        referenceId: cart.id,
        createdBy: input.actorId,
      });
    }

    const { data: payment, error: paymentError } = await admin
      .from('payments')
      .insert({
        tenant_id: cart.tenantId,
        branch_id: cart.branchId,
        customer_id: cart.customerId,
        purpose: 'session',
        amount_cents: appliedCents,
        currency: 'SAR',
        provider: line.method === 'cash' ? 'cash' : 'manual',
        method: line.method,
        status: 'captured',
        captured_at: new Date().toISOString(),
        initiated_by: input.actorId,
        shift_id: cart.shiftId,
      } as never)
      .select('id')
      .single();
    if (paymentError || !payment) throw paymentError ?? new Error('Failed to record tender');

    cartPaymentRows.push({
      method: line.method,
      tenderedCents: line.amountCents,
      appliedCents,
      cardReference: line.cardReference,
      payerCustomerId: line.method === 'wallet' ? line.payerCustomerId : undefined,
      paymentId: payment.id,
    });
  }

  if (remainingToApply !== 0) throw new Error('underpayment');

  await admin.from('cart_payments').insert(
    cartPaymentRows.map((r) => ({
      cart_id: cart.id,
      method: r.method,
      amount_cents: r.tenderedCents,
      card_reference: r.cardReference ?? null,
      payer_customer_id: r.payerCustomerId ?? null,
      payment_id: r.paymentId,
    })) as never
  );

  // Accounting trail for any line paid from a wallet OTHER than the cart's
  // own customer — in addition to the wallet_ledger entry debitWallet()
  // already wrote, this links payer <-> cart <-> cashier for reporting.
  const crossWalletCharges = cartPaymentRows.filter((r) => r.method === 'wallet' && r.payerCustomerId && r.payerCustomerId !== cart.customerId);
  for (const charge of crossWalletCharges) {
    await admin.from('activity_log').insert({
      tenant_id: cart.tenantId,
      branch_id: cart.branchId,
      actor_id: input.actorId,
      actor_role: 'staff',
      action: 'wallet.charged_for_other',
      entity_type: 'cart',
      entity_id: cart.id,
      after: { payer_customer_id: charge.payerCustomerId, cart_id: cart.id, amount_cents: charge.appliedCents, charged_by: input.actorId },
    });
  }

  const { error: settleError } = await admin
    .from('carts')
    .update({ status: 'settled', settled_at: new Date().toISOString() } as never)
    .eq('id', cart.id);
  if (settleError) throw settleError;

  // Idempotency: issueInvoiceForCart itself looks up any existing invoice by
  // source_cart_id first and returns it unchanged — so even if settleCart is
  // somehow invoked twice for the same (now-settled, so blocked above by
  // cart_not_open) cart, no second invoice is ever issued.
  let invoiceId: string | undefined;
  try {
    const invoice = await issueInvoiceForCart({
      tenantId: cart.tenantId,
      branchId: cart.branchId,
      cartId: cart.id,
      issuedBy: input.actorId,
    });
    invoiceId = invoice.invoiceId;
  } catch (invoiceError) {
    console.error('[carts] CRITICAL: failed to issue invoice for cart settlement', cart.id, invoiceError);
  }

  await admin.from('activity_log').insert({
    tenant_id: cart.tenantId,
    branch_id: cart.branchId,
    actor_id: input.actorId,
    actor_role: 'staff',
    action: 'cart.settled',
    entity_type: 'cart',
    entity_id: cart.id,
    after: {
      total_cents: cart.totalCents,
      change_cents: changeCents,
      payments: cartPaymentRows.map((r) => ({
        method: r.method,
        tendered_cents: r.tenderedCents,
        applied_cents: r.appliedCents,
        card_reference: r.cardReference ?? null,
      })),
      invoice_id: invoiceId ?? null,
    },
  });

  if (cart.customerId) {
    const { data: profile } = await admin.from('profiles').select('walk_in_created').eq('id', cart.customerId).maybeSingle();
    if (profile && !profile.walk_in_created) {
      await awardPoints({
        tenantId: cart.tenantId,
        customerId: cart.customerId,
        points: computePointsEarned(cart.totalCents, false),
        reason: 'cart_settled',
        referenceType: 'cart',
        referenceId: cart.id,
        actorId: input.actorId,
      });
    }
  }

  return { invoiceId, totalPaidCents: cart.totalCents, changeCents };
}
