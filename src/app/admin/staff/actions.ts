'use server';
import { z } from 'zod';
import { requireAuth, userHasAnyRole } from '@/lib/auth';
import { listStaff, addStaff, updateStaffRole, setStaffActive, removeStaff } from '@/lib/staff';

const DEMO_TENANT_ID = '11111111-1111-1111-1111-111111111111';
const ADMIN_ROLES = ['manager', 'tenant_admin'] as const;

async function requireAdminCtx() {
  const ctx = await requireAuth();
  if (!userHasAnyRole(ctx, [...ADMIN_ROLES]) && !ctx.isSuperAdmin) throw new Error('Forbidden');
  // Determine actor's effective role for privilege checks
  const actorRole = ctx.isSuperAdmin ? 'super_admin' as const
    : ctx.roles.some((r) => r.role === 'tenant_admin') ? 'tenant_admin' as const
    : ctx.roles.some((r) => r.role === 'manager') ? 'manager' as const
    : 'staff' as const;
  return { ctx, actorRole };
}

export async function listStaffAction() {
  try {
    await requireAdminCtx();
    const staff = await listStaff(DEMO_TENANT_ID);
    return { ok: true as const, staff };
  } catch (err) { return { ok: false as const, error: String(err) }; }
}

const addStaffSchema = z.object({
  fullName: z.string().min(1).max(120),
  phone: z.string().optional().nullable(),
  email: z.string().email().optional().nullable(),
  role: z.enum(['tenant_admin', 'manager', 'staff']),
  branchId: z.string().uuid().optional().nullable(),
}).refine((d) => !!d.phone || !!d.email, { message: 'phone_or_email_required' });

export async function addStaffAction(raw: unknown) {
  try {
    const { ctx, actorRole } = await requireAdminCtx();
    const input = addStaffSchema.parse(raw);
    const result = await addStaff({
      tenantId: DEMO_TENANT_ID,
      fullName: input.fullName,
      phone: input.phone ?? null,
      email: input.email ?? null,
      role: input.role,
      branchId: input.branchId ?? null,
      actorId: ctx.userId,
      actorRole,
    });
    return { ok: true as const, ...result };
  } catch (err) { return { ok: false as const, error: String(err) }; }
}

const updateRoleSchema = z.object({
  userId: z.string().uuid(),
  role: z.enum(['tenant_admin', 'manager', 'staff']),
  branchId: z.string().uuid().optional().nullable(),
});

export async function updateStaffRoleAction(raw: unknown) {
  try {
    const { ctx, actorRole } = await requireAdminCtx();
    const input = updateRoleSchema.parse(raw);
    await updateStaffRole({
      tenantId: DEMO_TENANT_ID,
      userId: input.userId,
      role: input.role,
      branchId: input.branchId ?? null,
      actorId: ctx.userId,
      actorRole,
    });
    return { ok: true as const };
  } catch (err) { return { ok: false as const, error: String(err) }; }
}

export async function toggleStaffActiveAction(userId: string, isActive: boolean) {
  try {
    const { ctx } = await requireAdminCtx();
    await setStaffActive(DEMO_TENANT_ID, userId, isActive, ctx.userId);
    return { ok: true as const };
  } catch (err) { return { ok: false as const, error: String(err) }; }
}

export async function removeStaffAction(userId: string) {
  try {
    const { ctx } = await requireAdminCtx();
    await removeStaff(DEMO_TENANT_ID, userId, ctx.userId);
    return { ok: true as const };
  } catch (err) { return { ok: false as const, error: String(err) }; }
}
