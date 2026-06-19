'use server';

import { z } from 'zod';
import { requireAuth, userHasAnyRole } from '@/lib/auth';
import {
  listOffers,
  createOffer,
  updateOffer,
  setOfferActive,
  deleteOffer,
} from '@/lib/offers';

const DEMO_TENANT_ID = '11111111-1111-1111-1111-111111111111';
const ADMIN_ROLES = ['manager', 'tenant_admin'] as const;

async function requireAdminCtx() {
  const ctx = await requireAuth();
  if (!userHasAnyRole(ctx, [...ADMIN_ROLES]) && !ctx.isSuperAdmin) {
    throw new Error('Forbidden');
  }
  return ctx;
}

export async function listOffersAction() {
  try {
    await requireAdminCtx();
    const offers = await listOffers(DEMO_TENANT_ID);
    return { ok: true as const, offers };
  } catch (err) {
    return { ok: false as const, error: String(err) };
  }
}

const createOfferSchema = z.object({
  code: z.string().min(1).max(32).optional().default(''),
  nameEn: z.string().min(1).max(120),
  nameAr: z.string().min(1).max(120),
  descriptionEn: z.string().max(500).optional().nullable(),
  descriptionAr: z.string().max(500).optional().nullable(),
  discountType: z.enum(['percent', 'fixed', 'free_minutes', 'double_points']),
  discountValue: z.number().min(0).max(100000),
  redemptionType: z.enum(['code', 'auto']),
  appliesToGameTypeId: z.string().uuid().optional().nullable(),
  minAmountCents: z.number().min(0).optional().nullable(),
  maxUses: z.number().int().min(1).optional().nullable(),
  maxUsesPerCustomer: z.number().int().min(1).optional().nullable(),
  minTier: z.string().optional().nullable(),
  validFrom: z.string().optional().nullable(),
  validTo: z.string().optional().nullable(),
  isActive: z.boolean(),
});

export async function createOfferAction(raw: unknown) {
  try {
    const ctx = await requireAdminCtx();
    const input = createOfferSchema.parse(raw);
    const result = await createOffer({ ...input, tenantId: DEMO_TENANT_ID, actorId: ctx.userId });
    return { ok: true as const, offerId: result.offerId };
  } catch (err) {
    return { ok: false as const, error: String(err) };
  }
}

export async function updateOfferAction(offerId: string, raw: unknown) {
  try {
    const ctx = await requireAdminCtx();
    const input = createOfferSchema.partial().parse(raw);
    await updateOffer(offerId, DEMO_TENANT_ID, input, ctx.userId);
    return { ok: true as const };
  } catch (err) {
    return { ok: false as const, error: String(err) };
  }
}

export async function toggleOfferActiveAction(offerId: string, isActive: boolean) {
  try {
    const ctx = await requireAdminCtx();
    await setOfferActive(offerId, DEMO_TENANT_ID, isActive, ctx.userId);
    return { ok: true as const };
  } catch (err) {
    return { ok: false as const, error: String(err) };
  }
}

export async function deleteOfferAction(offerId: string) {
  try {
    const ctx = await requireAdminCtx();
    await deleteOffer(offerId, DEMO_TENANT_ID, ctx.userId);
    return { ok: true as const };
  } catch (err) {
    return { ok: false as const, error: String(err) };
  }
}
