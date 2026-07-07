'use server';

import { z } from 'zod';
import { requireAuth, userHasAnyRole } from '@/lib/auth';
import {
  getKpiSummary,
  getRevenueByDay,
  getRevenueByMethod,
  getRevenueByGameType,
  getPeakHours,
  getTopCustomers,
} from '@/lib/analytics';

const DEMO_TENANT_ID = '11111111-1111-1111-1111-111111111111';
const ADMIN_ROLES = ['manager', 'tenant_admin'] as const;

async function requireAdminCtx() {
  const ctx = await requireAuth();
  if (!userHasAnyRole(ctx, [...ADMIN_ROLES]) && !ctx.isSuperAdmin) {
    throw new Error('Forbidden');
  }
  return ctx;
}

const rangeSchema = z.object({
  fromDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  toDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export async function getAnalyticsAction(fromDate: string, toDate: string) {
  try {
    await requireAdminCtx();
    const parsed = rangeSchema.parse({ fromDate, toDate });

    const [kpi, byDay, byMethod, byGameType, peakHours, topCustomers] = await Promise.all([
      getKpiSummary(DEMO_TENANT_ID, parsed.fromDate, parsed.toDate),
      getRevenueByDay(DEMO_TENANT_ID, parsed.fromDate, parsed.toDate),
      getRevenueByMethod(DEMO_TENANT_ID, parsed.fromDate, parsed.toDate),
      getRevenueByGameType(DEMO_TENANT_ID, parsed.fromDate, parsed.toDate),
      getPeakHours(DEMO_TENANT_ID, parsed.fromDate, parsed.toDate),
      getTopCustomers(DEMO_TENANT_ID, parsed.fromDate, parsed.toDate, 10),
    ]);

    return { ok: true as const, kpi, byDay, byMethod, byGameType, peakHours, topCustomers };
  } catch (err) {
    return { ok: false as const, error: String(err) };
  }
}
