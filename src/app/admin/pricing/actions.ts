'use server';

import { z } from 'zod';
import { requireAuth, userHasAnyRole } from '@/lib/auth';
import {
  listPricingRules,
  createPricingRule,
  updatePricingRule,
  setPricingRuleActive,
  deletePricingRule,
} from '@/lib/pricing-admin';

const DEMO_TENANT_ID = '11111111-1111-1111-1111-111111111111';
const ADMIN_ROLES = ['manager', 'tenant_admin'] as const;

async function requireAdminCtx() {
  const ctx = await requireAuth();
  if (!userHasAnyRole(ctx, [...ADMIN_ROLES]) && !ctx.isSuperAdmin) throw new Error('Forbidden');
  return ctx;
}

export async function listPricingRulesAction() {
  try {
    await requireAdminCtx();
    const rules = await listPricingRules(DEMO_TENANT_ID);
    return { ok: true as const, rules };
  } catch (err) {
    return { ok: false as const, error: String(err) };
  }
}

const pricingSchema = z.object({
  gameTypeId: z.string().uuid(),
  branchId: z.string().uuid().optional().nullable(),
  name: z.string().min(1).max(120),
  unit: z.enum(['per_minute', 'per_hour', 'per_session', 'per_player_hour']),
  amountSar: z.number().min(0),  // SAR value; we multiply by 100 to get halalas
  startsAtTime: z.string().optional().nullable(),
  endsAtTime: z.string().optional().nullable(),
  daysOfWeek: z.array(z.number().int().min(0).max(6)).optional().nullable(),
  validFrom: z.string().optional().nullable(),
  validTo: z.string().optional().nullable(),
  priority: z.number().int().min(0).max(999),
  isActive: z.boolean(),
});

export async function createPricingRuleAction(raw: unknown) {
  try {
    const ctx = await requireAdminCtx();
    const input = pricingSchema.parse(raw);
    const result = await createPricingRule({
      tenantId: DEMO_TENANT_ID,
      branchId: input.branchId ?? null,
      gameTypeId: input.gameTypeId,
      name: input.name,
      unit: input.unit,
      amountCents: Math.round(input.amountSar * 100),
      startsAtTime: input.startsAtTime ?? null,
      endsAtTime: input.endsAtTime ?? null,
      daysOfWeek: input.daysOfWeek ?? null,
      validFrom: input.validFrom ?? null,
      validTo: input.validTo ?? null,
      priority: input.priority,
      isActive: input.isActive,
      actorId: ctx.userId,
    });
    return { ok: true as const, ruleId: result.ruleId };
  } catch (err) {
    return { ok: false as const, error: String(err) };
  }
}

export async function updatePricingRuleAction(ruleId: string, raw: unknown) {
  try {
    const ctx = await requireAdminCtx();
    const input = pricingSchema.partial().parse(raw);
    const patch: Record<string, unknown> = { ...input };
    if (input.amountSar !== undefined) {
      patch.amountCents = Math.round(input.amountSar * 100);
    }
    delete patch.amountSar;
    await updatePricingRule(ruleId, DEMO_TENANT_ID, patch, ctx.userId);
    return { ok: true as const };
  } catch (err) {
    return { ok: false as const, error: String(err) };
  }
}

export async function togglePricingRuleActiveAction(ruleId: string, isActive: boolean) {
  try {
    const ctx = await requireAdminCtx();
    await setPricingRuleActive(ruleId, DEMO_TENANT_ID, isActive, ctx.userId);
    return { ok: true as const };
  } catch (err) {
    return { ok: false as const, error: String(err) };
  }
}

export async function deletePricingRuleAction(ruleId: string) {
  try {
    const ctx = await requireAdminCtx();
    await deletePricingRule(ruleId, DEMO_TENANT_ID, ctx.userId);
    return { ok: true as const };
  } catch (err) {
    return { ok: false as const, error: String(err) };
  }
}
