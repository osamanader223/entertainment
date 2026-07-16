'use server';

import { z } from 'zod';
import { requireAuth, userHasAnyRole } from '@/lib/auth';
import { getVenueSettings, updateTenantSettings, updateBranchSettings } from '@/lib/venue-settings';

const DEMO_TENANT_ID = '11111111-1111-1111-1111-111111111111';
const DEMO_BRANCH_ID = '22222222-2222-2222-2222-222222222222';
const ADMIN_ROLES = ['manager', 'tenant_admin'] as const;

async function requireAdminCtx() {
  const ctx = await requireAuth();
  if (!userHasAnyRole(ctx, [...ADMIN_ROLES]) && !ctx.isSuperAdmin) {
    throw new Error('Forbidden');
  }
  const isTenantAdminOrSuper = ctx.isSuperAdmin || userHasAnyRole(ctx, ['tenant_admin']);
  return { ctx, isTenantAdminOrSuper };
}

export async function getVenueSettingsAction() {
  try {
    await requireAdminCtx();
    const settings = await getVenueSettings(DEMO_TENANT_ID, DEMO_BRANCH_ID);
    return { ok: true as const, settings };
  } catch (err) {
    return { ok: false as const, error: String(err) };
  }
}

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Must be a hex color like #FF2D9E');

const tenantSettingsSchema = z.object({
  displayName: z.string().min(1).max(120).optional(),
  brandPrimaryColor: hexColor.optional(),
  brandAccentColor: hexColor.optional(),
  logoUrl: z.string().url().optional().nullable(),
});

export async function updateTenantSettingsAction(raw: unknown) {
  try {
    const { ctx, isTenantAdminOrSuper } = await requireAdminCtx();
    const input = tenantSettingsSchema.parse(raw);
    await updateTenantSettings(DEMO_TENANT_ID, input, ctx.userId, isTenantAdminOrSuper);
    return { ok: true as const };
  } catch (err) {
    return { ok: false as const, error: String(err) };
  }
}

const queuePolicySchema = z.object({
  notification_window_minutes: z.number().int().min(1).max(120).optional(),
  max_wait_minutes: z.number().int().min(1).max(600).optional(),
  cancellation_credit_percent: z.number().int().min(0).max(100).optional(),
  allow_anonymous_queue: z.boolean().optional(),
});

const branchSettingsSchema = z.object({
  displayName: z.string().min(1).max(120).optional(),
  addressLine: z.string().max(200).optional().nullable(),
  city: z.string().max(80).optional().nullable(),
  phone: z.string().max(30).optional().nullable(),
  whatsappNumber: z.string().max(30).optional().nullable(),
  opensAt: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/).optional(),
  closesAt: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/).optional(),
  queuePolicy: queuePolicySchema.optional(),
});

export async function updateBranchSettingsAction(raw: unknown) {
  try {
    const { ctx } = await requireAdminCtx();
    const input = branchSettingsSchema.parse(raw);
    await updateBranchSettings(DEMO_TENANT_ID, DEMO_BRANCH_ID, input, ctx.userId);
    return { ok: true as const };
  } catch (err) {
    return { ok: false as const, error: String(err) };
  }
}
