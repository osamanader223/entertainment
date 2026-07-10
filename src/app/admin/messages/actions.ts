'use server';

import { requireAuth, userHasAnyRole } from '@/lib/auth';
import { listNotifications } from '@/lib/notifications';

const DEMO_TENANT_ID = '11111111-1111-1111-1111-111111111111';
const ADMIN_ROLES = ['manager', 'tenant_admin'] as const;

async function requireAdminCtx() {
  const ctx = await requireAuth();
  if (!userHasAnyRole(ctx, [...ADMIN_ROLES]) && !ctx.isSuperAdmin) {
    throw new Error('Forbidden');
  }
  return ctx;
}

export async function listNotificationsAction(input: { statusFilter?: string; templateFilter?: string }) {
  try {
    await requireAdminCtx();
    const notifications = await listNotifications({ tenantId: DEMO_TENANT_ID, ...input });
    return { ok: true as const, notifications };
  } catch (err) {
    return { ok: false as const, error: String(err) };
  }
}
