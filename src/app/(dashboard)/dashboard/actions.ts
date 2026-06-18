'use server';

import { requireAuth, userHasAnyRole } from '@/lib/auth';
import { endActiveSessionForStation } from '@/lib/sessions';

const DEMO_TENANT_ID = '11111111-1111-1111-1111-111111111111';
const DEMO_BRANCH_ID = '22222222-2222-2222-2222-222222222222';

export async function confirmStationSessionEndedAction(stationId: string) {
  const ctx = await requireAuth();
  if (!userHasAnyRole(ctx, ['staff', 'manager', 'tenant_admin']) && !ctx.isSuperAdmin) {
    return { ok: false as const, error: 'Not authorized' };
  }

  try {
    const result = await endActiveSessionForStation({
      stationId,
      tenantId: DEMO_TENANT_ID,
      branchId: DEMO_BRANCH_ID,
      endedBy: ctx.userId,
    });
    return { ok: true as const, ...result };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : 'Failed to end session' };
  }
}
