'use server';

import { requireAuth } from '@/lib/auth';
import { getWalletBalance, getWalletLedger } from '@/lib/wallet';
import { createTopUpIntent } from '@/lib/moyasar';

const DEMO_TENANT_ID = '11111111-1111-1111-1111-111111111111';

export async function startTopUpAction(args: { amountCents: number }): Promise<{
  internalPaymentId?: string;
  publishableKey?: string;
  error?: string;
}> {
  if (args.amountCents < 500 || args.amountCents > 100_000) {
    return { error: 'Amount must be between 5 SAR and 1000 SAR' };
  }

  try {
    const ctx = await requireAuth();
    const result = await createTopUpIntent({
      tenantId: DEMO_TENANT_ID,
      customerId: ctx.userId,
      amountCents: args.amountCents,
    });
    return result;
  } catch (err) {
    console.error('[startTopUpAction]', err);
    return { error: 'Failed to start payment. Please try again.' };
  }
}

export async function getWalletStateAction(): Promise<{
  balanceCents?: number;
  ledger?: Awaited<ReturnType<typeof getWalletLedger>>;
  error?: string;
}> {
  try {
    const ctx = await requireAuth();
    const [balanceCents, ledger] = await Promise.all([
      getWalletBalance(DEMO_TENANT_ID, ctx.userId),
      getWalletLedger(DEMO_TENANT_ID, ctx.userId, 20),
    ]);
    return { balanceCents, ledger };
  } catch (err) {
    console.error('[getWalletStateAction]', err);
    return { error: 'Failed to load wallet' };
  }
}
