'use server';

import { z } from 'zod';
import { requireRole } from '@/lib/auth';
import { phoneSchema } from '@/lib/validators/auth';
import { getWalletBalance } from '@/lib/wallet';
import {
  lookupCustomerByPhone,
  createWalkInCustomer,
  computeSessionPrice,
  computeSessionPriceForStation,
  startCashierSession,
} from '@/lib/cashier';

const DEMO_TENANT_ID = '11111111-1111-1111-1111-111111111111';
const STAFF_ROLES = ['staff', 'manager', 'tenant_admin'] as const;

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
  durationMinutes: z.number().int().min(5).max(480),
});

export async function computeSessionPriceForStationAction(input: {
  stationId: string;
  durationMinutes: number;
}) {
  await requireRole(DEMO_TENANT_ID, [...STAFF_ROLES]);

  const parsed = computePriceForStationSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  }

  try {
    const amountCents = await computeSessionPriceForStation(parsed.data);
    return { amountCents };
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
  durationMinutes: z.number().int().min(5).max(480),
  paymentMethod: z.enum(['cash', 'wallet']),
});

export async function startCashierSessionAction(input: {
  branchId: string;
  stationId: string;
  customerId: string;
  customerLabel: string;
  durationMinutes: number;
  paymentMethod: 'cash' | 'wallet';
}) {
  const ctx = await requireRole(DEMO_TENANT_ID, [...STAFF_ROLES]);

  const parsed = startSessionSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  }

  try {
    const result = await startCashierSession({
      tenantId: DEMO_TENANT_ID,
      ...parsed.data,
      actorId: ctx.userId,
    });
    return { result };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Failed to start session' };
  }
}
