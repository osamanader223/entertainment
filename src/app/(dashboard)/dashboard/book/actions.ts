'use server';

import { z } from 'zod';
import { requireAuth } from '@/lib/auth';
import { computeSessionPriceForStation } from '@/lib/cashier';
import { createCustomerBooking } from '@/lib/booking';

const DEMO_TENANT_ID = '11111111-1111-1111-1111-111111111111';
const DEMO_BRANCH_ID = '22222222-2222-2222-2222-222222222222';

const priceSchema = z.object({
  stationId: z.string().uuid(),
  durationMinutes: z.number().int().min(5).max(480),
});

export async function getBookingPriceAction(input: { stationId: string; durationMinutes: number }) {
  await requireAuth();

  const parsed = priceSchema.safeParse(input);
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

const createBookingSchema = z.object({
  stationId: z.string().uuid(),
  durationMinutes: z.number().int().min(5).max(480),
});

export async function createBookingAction(input: { stationId: string; durationMinutes: number }) {
  const ctx = await requireAuth();

  const parsed = createBookingSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  }

  try {
    const result = await createCustomerBooking({
      tenantId: DEMO_TENANT_ID,
      branchId: DEMO_BRANCH_ID,
      stationId: parsed.data.stationId,
      customerId: ctx.userId,
      durationMinutes: parsed.data.durationMinutes,
      paymentMethod: 'wallet',
    });
    return { ok: true as const, ...result };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : 'Failed to create booking' };
  }
}
