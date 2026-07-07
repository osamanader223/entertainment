import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { creditWallet, debitWallet } from '@/lib/wallet';

export interface CustomerSearchResult {
  customerId: string;
  fullName: string | null;
  phone: string | null;
  email: string | null;
  balanceCents: number;
  tier: string;
}

/**
 * Search customers by name/phone/email to find whose wallet to manage.
 * Profiles aren't tenant-scoped in this schema, so the search itself is
 * global — but balance/tier are always read scoped to this tenant.
 */
export async function searchCustomers(tenantId: string, query: string): Promise<CustomerSearchResult[]> {
  const admin = createAdminClient();
  // Strip characters that are meaningful in PostgREST's filter grammar (comma
  // separates .or() conditions, parens group them) so a stray character in a
  // name/phone/email search can't break the query.
  const q = query.trim().replace(/[,()]/g, '');
  if (!q) return [];

  const { data: profilesRaw, error } = await admin
    .from('profiles')
    .select('id, full_name, phone, email')
    .or(`full_name.ilike.%${q}%,phone.ilike.%${q}%,email.ilike.%${q}%`)
    .limit(20);
  if (error) throw error;

  const profiles = (profilesRaw ?? []) as unknown as Array<{
    id: string; full_name: string | null; phone: string | null; email: string | null;
  }>;
  if (profiles.length === 0) return [];

  const customerIds = profiles.map((p) => p.id);
  const [{ data: walletsRaw }, { data: loyaltyRaw }] = await Promise.all([
    admin.from('wallets').select('customer_id, balance_cents').eq('tenant_id', tenantId).in('customer_id', customerIds),
    admin.from('loyalty_accounts').select('customer_id, tier').eq('tenant_id', tenantId).in('customer_id', customerIds),
  ]);
  const balanceMap = new Map(
    ((walletsRaw ?? []) as unknown as Array<{ customer_id: string; balance_cents: number }>)
      .map((w) => [w.customer_id, w.balance_cents]),
  );
  const tierMap = new Map(
    ((loyaltyRaw ?? []) as unknown as Array<{ customer_id: string; tier: string }>)
      .map((l) => [l.customer_id, l.tier]),
  );

  return profiles.map((p) => ({
    customerId: p.id,
    fullName: p.full_name,
    phone: p.phone,
    email: p.email,
    balanceCents: balanceMap.get(p.id) ?? 0,
    tier: tierMap.get(p.id) ?? 'silver',
  }));
}

export interface WalletLedgerRow {
  kind: string;
  deltaCents: number;
  balanceAfterCents: number;
  reason: string | null;
  createdAt: string;
}

export interface RecentPaymentRow {
  id: string;
  amountCents: number;
  purpose: string;
  method: string | null;
  status: string;
  refundedAmountCents: number;
  createdAt: string;
}

export interface CustomerWalletDetail {
  balanceCents: number;
  lifetimeCreditedCents: number;
  lifetimeDebitedCents: number;
  isFrozen: boolean;
  ledger: WalletLedgerRow[];
  recentPayments: RecentPaymentRow[];
}

/** Admin-scoped wallet detail for ANY customer (not RLS-limited to the caller). */
export async function getCustomerWalletDetail(tenantId: string, customerId: string): Promise<CustomerWalletDetail> {
  const admin = createAdminClient();

  const { data: walletRaw } = await admin
    .from('wallets')
    .select('id, balance_cents, lifetime_credited_cents, lifetime_debited_cents, is_frozen')
    .eq('tenant_id', tenantId)
    .eq('customer_id', customerId)
    .maybeSingle();
  const wallet = walletRaw as unknown as {
    id: string; balance_cents: number; lifetime_credited_cents: number;
    lifetime_debited_cents: number; is_frozen: boolean;
  } | null;

  let ledger: WalletLedgerRow[] = [];
  if (wallet?.id) {
    const { data: ledgerRaw } = await admin
      .from('wallet_ledger')
      .select('kind, delta_cents, balance_after_cents, reason, created_at')
      .eq('wallet_id', wallet.id)
      .order('created_at', { ascending: false })
      .limit(30);
    ledger = ((ledgerRaw ?? []) as unknown as Array<{
      kind: string; delta_cents: number; balance_after_cents: number; reason: string | null; created_at: string;
    }>).map((r) => ({
      kind: r.kind,
      deltaCents: r.delta_cents,
      balanceAfterCents: r.balance_after_cents,
      reason: r.reason,
      createdAt: r.created_at,
    }));
  }

  const { data: paymentsRaw } = await admin
    .from('payments')
    .select('id, amount_cents, purpose, method, status, refunded_amount_cents, created_at')
    .eq('tenant_id', tenantId)
    .eq('customer_id', customerId)
    .order('created_at', { ascending: false })
    .limit(30);
  const recentPayments = ((paymentsRaw ?? []) as unknown as Array<{
    id: string; amount_cents: number; purpose: string; method: string | null;
    status: string; refunded_amount_cents: number; created_at: string;
  }>).map((r) => ({
    id: r.id,
    amountCents: r.amount_cents,
    purpose: r.purpose,
    method: r.method,
    status: r.status,
    refundedAmountCents: r.refunded_amount_cents,
    createdAt: r.created_at,
  }));

  return {
    balanceCents: wallet?.balance_cents ?? 0,
    lifetimeCreditedCents: wallet?.lifetime_credited_cents ?? 0,
    lifetimeDebitedCents: wallet?.lifetime_debited_cents ?? 0,
    isFrozen: wallet?.is_frozen ?? false,
    ledger,
    recentPayments,
  };
}

/** Admin manual wallet credit (goodwill, compensation). */
export async function adminCreditWallet(input: {
  tenantId: string; customerId: string; amountCents: number; reason: string; actorId: string;
}): Promise<{ balanceCents: number }> {
  const admin = createAdminClient();
  const result = await creditWallet({
    tenantId: input.tenantId,
    customerId: input.customerId,
    amountCents: input.amountCents,
    kind: 'credit_admin',
    reason: input.reason,
    referenceType: 'admin_action',
    createdBy: input.actorId,
  });

  await admin.from('activity_log').insert({
    tenant_id: input.tenantId,
    actor_id: input.actorId,
    actor_role: 'manager' as never,
    action: 'wallet.admin_credit',
    entity_type: 'wallet',
    entity_id: result.walletId,
    after: { amount_cents: input.amountCents, reason: input.reason, target_customer: input.customerId } as never,
  });

  return { balanceCents: result.balanceCents };
}

/** Admin manual wallet debit (correction). */
export async function adminDebitWallet(input: {
  tenantId: string; customerId: string; amountCents: number; reason: string; actorId: string;
}): Promise<{ balanceCents: number }> {
  const admin = createAdminClient();
  const result = await debitWallet({
    tenantId: input.tenantId,
    customerId: input.customerId,
    amountCents: input.amountCents,
    kind: 'debit_admin',
    reason: input.reason,
    referenceType: 'admin_action',
    createdBy: input.actorId,
  });

  await admin.from('activity_log').insert({
    tenant_id: input.tenantId,
    actor_id: input.actorId,
    actor_role: 'manager' as never,
    action: 'wallet.admin_debit',
    entity_type: 'wallet',
    entity_id: result.walletId,
    after: { amount_cents: input.amountCents, reason: input.reason, target_customer: input.customerId } as never,
  });

  return { balanceCents: result.balanceCents };
}

/**
 * Refund a specific payment.
 * - wallet/cash/manual payments: credit the customer's wallet for the outstanding amount.
 * - moyasar (card) payments: TODO(moyasar-refund) — the Moyasar refund API isn't wired
 *   yet, so for now these are also refunded to wallet as store credit (noted in the log).
 * Never refunds more than (amount_cents - refunded_amount_cents), and blocks a second
 * refund on an already-fully-refunded payment.
 */
export async function refundPayment(input: {
  tenantId: string; paymentId: string; reason: string; actorId: string; refundToWallet: boolean;
}): Promise<{ refundedCents: number; method: string }> {
  const admin = createAdminClient();

  const { data: paymentRaw, error } = await admin
    .from('payments')
    .select('id, customer_id, amount_cents, refunded_amount_cents, status, provider')
    .eq('id', input.paymentId)
    .eq('tenant_id', input.tenantId)
    .maybeSingle();
  if (error) throw error;
  const payment = paymentRaw as unknown as {
    id: string; customer_id: string | null; amount_cents: number;
    refunded_amount_cents: number; status: string; provider: string;
  } | null;

  if (!payment) throw new Error('payment_not_found');
  if (payment.status !== 'captured') throw new Error('payment_not_refundable');
  if (!payment.customer_id) throw new Error('payment_has_no_customer');

  const refundableCents = payment.amount_cents - payment.refunded_amount_cents;
  if (refundableCents <= 0) throw new Error('already_refunded');

  // TODO(moyasar-refund): once the Moyasar refund API is wired, card payments (provider
  // 'moyasar'/'hyperpay') should call it here instead of falling back to a wallet credit.
  // input.refundToWallet is accepted for forward-compatibility with that future branch —
  // today every payment type refunds to wallet regardless of its value.

  await creditWallet({
    tenantId: input.tenantId,
    customerId: payment.customer_id,
    amountCents: refundableCents,
    kind: 'credit_admin',
    reason: input.reason || 'refund',
    referenceType: 'payment',
    referenceId: payment.id,
    createdBy: input.actorId,
  });

  const { error: updateError } = await admin
    .from('payments')
    .update({
      refunded_amount_cents: payment.amount_cents,
      status: 'refunded',
    })
    .eq('id', payment.id);
  if (updateError) throw updateError;

  await admin.from('activity_log').insert({
    tenant_id: input.tenantId,
    actor_id: input.actorId,
    actor_role: 'manager' as never,
    action: 'payment.refunded',
    entity_type: 'payment',
    entity_id: payment.id,
    after: {
      amount: refundableCents,
      method: 'wallet_credit',
      original_provider: payment.provider,
      reason: input.reason,
    } as never,
  });

  return { refundedCents: refundableCents, method: 'wallet_credit' };
}
