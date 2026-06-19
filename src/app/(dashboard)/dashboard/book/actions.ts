'use server';

import { z } from 'zod';
import { requireAuth } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { computeSessionPriceForStation } from '@/lib/cashier';
import { createCustomerBooking } from '@/lib/booking';
import { resolveOfferForCheckout } from '@/lib/offers';

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

const previewOfferSchema = z.object({
  stationId: z.string().uuid(),
  durationMinutes: z.number().int().min(5).max(480),
  code: z.string().optional(),
});

export async function previewOfferAction(input: {
  stationId: string;
  durationMinutes: number;
  code?: string;
}) {
  const ctx = await requireAuth();

  const parsed = previewOfferSchema.safeParse(input);
  if (!parsed.success) {
    return { applied: false, discountCents: 0, freeMinutes: 0, doublePoints: false, finalAmountCents: 0 };
  }

  try {
    const admin = createAdminClient();
    const { data: station } = await admin
      .from('stations')
      .select('game_type_id')
      .eq('id', parsed.data.stationId)
      .maybeSingle();

    if (!station) {
      return { applied: false, discountCents: 0, freeMinutes: 0, doublePoints: false, finalAmountCents: 0 };
    }

    const amountCents = await computeSessionPriceForStation({
      stationId: parsed.data.stationId,
      durationMinutes: parsed.data.durationMinutes,
    });

    const result = await resolveOfferForCheckout({
      tenantId: DEMO_TENANT_ID,
      customerId: ctx.userId,
      gameTypeId: station.game_type_id,
      amountCents,
      code: parsed.data.code,
    });

    return {
      applied: result.applied,
      offerNameEn: result.offer?.nameEn,
      offerNameAr: result.offer?.nameAr,
      discountType: result.offer?.discountType,
      discountCents: result.discountCents,
      freeMinutes: result.freeMinutes,
      doublePoints: result.doublePoints,
      finalAmountCents: result.finalAmountCents,
      reason: result.reason,
    };
  } catch {
    return { applied: false, discountCents: 0, freeMinutes: 0, doublePoints: false, finalAmountCents: 0 };
  }
}

const createBookingSchema = z.object({
  stationId: z.string().uuid(),
  durationMinutes: z.number().int().min(5).max(480),
  offerCode: z.string().optional(),
});

export async function createBookingAction(input: {
  stationId: string;
  durationMinutes: number;
  offerCode?: string;
}) {
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
      offerCode: parsed.data.offerCode,
    });
    return { ok: true as const, ...result };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : 'Failed to create booking' };
  }
}
