import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

export type WalletEntryKind =
  | 'credit_cancellation'
  | 'credit_topup'
  | 'credit_offer'
  | 'credit_referral'
  | 'credit_admin'
  | 'debit_booking'
  | 'debit_queue'
  | 'debit_purchase'
  | 'debit_admin';

export interface WalletOpResult {
  walletId: string;
  ledgerId: string;
  balanceCents: number;
}

/**
 * Get the current wallet balance for a customer in a tenant.
 * Returns 0 if no wallet exists yet.
 */
export async function getWalletBalance(
  tenantId: string,
  customerId: string
): Promise<number> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('wallets')
    .select('balance_cents')
    .eq('tenant_id', tenantId)
    .eq('customer_id', customerId)
    .maybeSingle();
  return Number(data?.balance_cents ?? 0);
}

/**
 * Credit a wallet. Idempotent only if you pass a unique reference_id.
 * Uses service role (bypasses RLS) since this is a system operation.
 */
export async function creditWallet(args: {
  tenantId: string;
  customerId: string;
  amountCents: number;
  kind: WalletEntryKind;
  reason?: string;
  referenceType?: string;
  referenceId?: string;
  metadata?: Record<string, unknown>;
  createdBy?: string;
}): Promise<WalletOpResult> {
  if (!args.kind.startsWith('credit_')) {
    throw new Error(`creditWallet requires a credit_* kind, got ${args.kind}`);
  }
  const admin = createAdminClient();
  const { data, error } = await admin.rpc('wallet_credit', {
    p_tenant_id: args.tenantId,
    p_customer_id: args.customerId,
    p_amount_cents: args.amountCents,
    p_kind: args.kind,
    p_reason: args.reason ?? null,
    p_reference_type: args.referenceType ?? null,
    p_reference_id: args.referenceId ?? null,
    p_metadata: (args.metadata as never) ?? null,
    p_created_by: args.createdBy ?? null,
  });
  if (error) throw error;
  const result = data as { wallet_id: string; ledger_id: string; balance_cents: number };
  return { walletId: result.wallet_id, ledgerId: result.ledger_id, balanceCents: Number(result.balance_cents) };
}

/**
 * Debit a wallet. Throws if insufficient funds or wallet frozen.
 */
export async function debitWallet(args: {
  tenantId: string;
  customerId: string;
  amountCents: number;
  kind: WalletEntryKind;
  reason?: string;
  referenceType?: string;
  referenceId?: string;
  metadata?: Record<string, unknown>;
  createdBy?: string;
}): Promise<WalletOpResult> {
  if (!args.kind.startsWith('debit_')) {
    throw new Error(`debitWallet requires a debit_* kind, got ${args.kind}`);
  }
  const admin = createAdminClient();
  const { data, error } = await admin.rpc('wallet_debit', {
    p_tenant_id: args.tenantId,
    p_customer_id: args.customerId,
    p_amount_cents: args.amountCents,
    p_kind: args.kind,
    p_reason: args.reason ?? null,
    p_reference_type: args.referenceType ?? null,
    p_reference_id: args.referenceId ?? null,
    p_metadata: (args.metadata as never) ?? null,
    p_created_by: args.createdBy ?? null,
  });
  if (error) throw error;
  const result = data as { wallet_id: string; ledger_id: string; balance_cents: number };
  return { walletId: result.wallet_id, ledgerId: result.ledger_id, balanceCents: Number(result.balance_cents) };
}

/**
 * Fetch the most recent ledger entries for a customer's wallet.
 */
export async function getWalletLedger(
  tenantId: string,
  customerId: string,
  limit = 20
) {
  const supabase = await createClient();
  const { data: wallet } = await supabase
    .from('wallets')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('customer_id', customerId)
    .maybeSingle();

  if (!wallet) return [];

  const { data } = await supabase
    .from('wallet_ledger')
    .select('id, kind, delta_cents, balance_after_cents, reason, reference_type, reference_id, created_at')
    .eq('wallet_id', wallet.id)
    .order('created_at', { ascending: false })
    .limit(limit);

  return data ?? [];
}
