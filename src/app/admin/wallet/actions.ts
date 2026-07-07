'use server';

import { z } from 'zod';
import { requireAuth, userHasAnyRole } from '@/lib/auth';
import {
  searchCustomers,
  getCustomerWalletDetail,
  adminCreditWallet,
  adminDebitWallet,
  refundPayment,
} from '@/lib/wallet-admin';

const DEMO_TENANT_ID = '11111111-1111-1111-1111-111111111111';
const ADMIN_ROLES = ['manager', 'tenant_admin'] as const;

async function requireAdminCtx() {
  const ctx = await requireAuth();
  if (!userHasAnyRole(ctx, [...ADMIN_ROLES]) && !ctx.isSuperAdmin) {
    throw new Error('Forbidden');
  }
  return ctx;
}

const searchSchema = z.object({ query: z.string().min(1).max(120) });

export async function searchCustomersAction(query: string) {
  try {
    await requireAdminCtx();
    const parsed = searchSchema.parse({ query });
    const customers = await searchCustomers(DEMO_TENANT_ID, parsed.query);
    return { ok: true as const, customers };
  } catch (err) {
    return { ok: false as const, error: String(err) };
  }
}

const customerIdSchema = z.object({ customerId: z.string().uuid() });

export async function getCustomerWalletDetailAction(customerId: string) {
  try {
    await requireAdminCtx();
    const parsed = customerIdSchema.parse({ customerId });
    const detail = await getCustomerWalletDetail(DEMO_TENANT_ID, parsed.customerId);
    return { ok: true as const, detail };
  } catch (err) {
    return { ok: false as const, error: String(err) };
  }
}

const moneyActionSchema = z.object({
  customerId: z.string().uuid(),
  amountCents: z.number().int().min(1).max(100_000_000),
  reason: z.string().min(3).max(300),
});

export async function adminCreditAction(input: { customerId: string; amountCents: number; reason: string }) {
  try {
    const ctx = await requireAdminCtx();
    const parsed = moneyActionSchema.parse(input);
    const result = await adminCreditWallet({ tenantId: DEMO_TENANT_ID, actorId: ctx.userId, ...parsed });
    return { ok: true as const, balanceCents: result.balanceCents };
  } catch (err) {
    return { ok: false as const, error: String(err) };
  }
}

export async function adminDebitAction(input: { customerId: string; amountCents: number; reason: string }) {
  try {
    const ctx = await requireAdminCtx();
    const parsed = moneyActionSchema.parse(input);
    const result = await adminDebitWallet({ tenantId: DEMO_TENANT_ID, actorId: ctx.userId, ...parsed });
    return { ok: true as const, balanceCents: result.balanceCents };
  } catch (err) {
    return { ok: false as const, error: String(err) };
  }
}

const refundSchema = z.object({
  paymentId: z.string().uuid(),
  reason: z.string().min(3).max(300),
  refundToWallet: z.boolean(),
});

export async function refundPaymentAction(input: { paymentId: string; reason: string; refundToWallet: boolean }) {
  try {
    const ctx = await requireAdminCtx();
    const parsed = refundSchema.parse(input);
    const result = await refundPayment({ tenantId: DEMO_TENANT_ID, actorId: ctx.userId, ...parsed });
    return { ok: true as const, refundedCents: result.refundedCents, method: result.method };
  } catch (err) {
    return { ok: false as const, error: String(err) };
  }
}
