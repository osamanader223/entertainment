import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { creditWallet } from '@/lib/wallet';

const MOYASAR_BASE = 'https://api.moyasar.com/v1';

export interface MoyasarPayment {
  id: string;
  status: string;
  amount: number;
  currency: string;
  description: string;
  metadata?: Record<string, string>;
  source?: Record<string, unknown>;
  created_at: string;
}

function moyasarAuth(): string {
  const secret = process.env.MOYASAR_SECRET_KEY;
  if (!secret) throw new Error('MOYASAR_SECRET_KEY not configured');
  return `Basic ${Buffer.from(`${secret}:`).toString('base64')}`;
}

export async function fetchMoyasarPayment(paymentId: string): Promise<MoyasarPayment> {
  const res = await fetch(`${MOYASAR_BASE}/payments/${paymentId}`, {
    headers: { Authorization: moyasarAuth() },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Moyasar API error ${res.status} for payment ${paymentId}`);
  return res.json() as Promise<MoyasarPayment>;
}

/**
 * Insert an 'initiated' payment row so we know which customer/tenant this top-up belongs to.
 * Returns internalPaymentId (stored in Moyasar metadata) and the publishableKey.
 *
 * NEXT_PUBLIC_ prefix is NOT needed — the publishable key is returned from this server action
 * and passed to the client as a prop/return value, never read directly from env on the browser.
 */
export async function createTopUpIntent(args: {
  tenantId: string;
  customerId: string;
  amountCents: number;
}): Promise<{ internalPaymentId: string; publishableKey: string }> {
  const publishableKey = process.env.MOYASAR_PUBLISHABLE_KEY;
  if (!publishableKey) throw new Error('MOYASAR_PUBLISHABLE_KEY not configured');

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('payments')
    .insert({
      tenant_id: args.tenantId,
      customer_id: args.customerId,
      // wallet_topup was added via ALTER TYPE in migration 00006
      purpose: 'wallet_topup' as never,
      provider: 'moyasar',
      status: 'initiated',
      amount_cents: args.amountCents,
      currency: 'SAR',
      initiated_by: args.customerId,
    })
    .select('id')
    .single();

  if (error || !data) throw error ?? new Error('Failed to insert payment record');
  return { internalPaymentId: data.id as string, publishableKey };
}

/**
 * Idempotent wallet credit — called only from the webhook handler.
 * Uses provider_payment_id as the idempotency key: if a captured row already exists
 * for this Moyasar payment, returns early without double-crediting.
 */
export async function applyPaidTopUp(args: {
  moyasarPaymentId: string;
  moyasarPayment: MoyasarPayment;
  internalPaymentId: string;
}): Promise<{ credited: boolean; alreadyProcessed: boolean }> {
  const admin = createAdminClient();

  // Idempotency check — bail if we've already captured this Moyasar payment
  const { data: existing } = await admin
    .from('payments')
    .select('id')
    .eq('provider_payment_id', args.moyasarPaymentId)
    .eq('status', 'captured')
    .maybeSingle();

  if (existing) return { credited: false, alreadyProcessed: true };

  // Load our initiated record to get tenant/customer/amount
  const { data: record, error: fetchErr } = await admin
    .from('payments')
    .select('id, tenant_id, customer_id, amount_cents')
    .eq('id', args.internalPaymentId)
    .maybeSingle();

  if (fetchErr || !record) {
    throw new Error(`Payment record not found: ${args.internalPaymentId}`);
  }

  // Verify the amount Moyasar reports matches what we intended (halalas = cents for SAR)
  if (record.amount_cents !== args.moyasarPayment.amount) {
    throw new Error(
      `Amount mismatch: db=${record.amount_cents as number} moyasar=${args.moyasarPayment.amount}`,
    );
  }

  // Credit the wallet
  await creditWallet({
    tenantId: record.tenant_id as string,
    customerId: record.customer_id as string,
    amountCents: record.amount_cents as number,
    kind: 'credit_topup',
    reason: 'Moyasar wallet top-up',
    referenceType: 'payment',
    referenceId: record.id as string,
    metadata: { moyasar_payment_id: args.moyasarPaymentId },
  });

  // Mark payment as captured
  await admin
    .from('payments')
    .update({
      status: 'captured',
      provider_payment_id: args.moyasarPaymentId,
      captured_at: new Date().toISOString(),
      provider_raw: args.moyasarPayment as never,
    })
    .eq('id', args.internalPaymentId);

  return { credited: true, alreadyProcessed: false };
}
