import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { normalizePhone } from '@/lib/utils';

type StaffRole = 'tenant_admin' | 'manager' | 'staff';
type ActorRole = StaffRole | 'super_admin';

export interface StaffMember {
  userId: string;
  fullName: string | null;
  phone: string | null;
  email: string | null;
  role: StaffRole;
  branchId: string | null;
  branchName: string | null;
  isActive: boolean;
  grantedAt: string;
}

const STAFF_ROLES: string[] = ['tenant_admin', 'manager', 'staff'];

function canManage(actorRole: ActorRole, targetRole: StaffRole): boolean {
  if (actorRole === 'super_admin' || actorRole === 'tenant_admin') return true;
  if (actorRole === 'manager') return targetRole === 'staff';
  return false;
}

export async function listStaff(tenantId: string): Promise<StaffMember[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('user_tenant_roles')
    .select('user_id, role, branch_id, is_active, granted_at')
    .eq('tenant_id', tenantId)
    .in('role', STAFF_ROLES as never[])
    .order('granted_at', { ascending: false });

  if (error) throw error;
  if (!data || data.length === 0) return [];

  const rows = data as unknown as Array<{
    user_id: string; role: StaffRole; branch_id: string | null;
    is_active: boolean; granted_at: string;
  }>;

  // Batch-fetch profiles and branches
  const userIds = [...new Set(rows.map((r) => r.user_id))];
  const branchIds = [...new Set(rows.map((r) => r.branch_id).filter((b): b is string => !!b))];

  const [{ data: profiles }, { data: branches }] = await Promise.all([
    admin.from('profiles').select('id, full_name, phone, email').in('id', userIds),
    branchIds.length
      ? admin.from('branches').select('id, display_name').in('id', branchIds)
      : Promise.resolve({ data: [] }),
  ]);

  const profileMap = new Map(
    ((profiles ?? []) as unknown as Array<{ id: string; full_name: string | null; phone: string | null; email: string | null }>)
      .map((p) => [p.id, p]),
  );
  const branchMap = new Map(
    ((branches ?? []) as unknown as Array<{ id: string; display_name: string }>)
      .map((b) => [b.id, b]),
  );

  return rows.map((r) => ({
    userId: r.user_id,
    fullName: profileMap.get(r.user_id)?.full_name ?? null,
    phone: profileMap.get(r.user_id)?.phone ?? null,
    email: profileMap.get(r.user_id)?.email ?? null,
    role: r.role,
    branchId: r.branch_id,
    branchName: r.branch_id ? (branchMap.get(r.branch_id)?.display_name ?? null) : null,
    isActive: r.is_active,
    grantedAt: r.granted_at,
  }));
}

export async function addStaff(input: {
  tenantId: string;
  fullName: string;
  phone?: string | null;
  email?: string | null;
  role: StaffRole;
  branchId?: string | null;
  actorId: string;
  actorRole: ActorRole;
}): Promise<{ userId: string; created: boolean }> {
  if (!canManage(input.actorRole, input.role)) {
    throw new Error('privilege_escalation_denied');
  }
  if (!input.phone && !input.email) {
    throw new Error('phone_or_email_required');
  }

  const admin = createAdminClient();
  const normalizedPhone = input.phone ? (normalizePhone(input.phone, 'SA') ?? input.phone) : null;

  // Look up existing profile
  let existingUserId: string | null = null;
  if (normalizedPhone) {
    const { data } = await admin.from('profiles').select('id').eq('phone', normalizedPhone).maybeSingle();
    if (data) existingUserId = (data as unknown as { id: string }).id;
  }
  if (!existingUserId && input.email) {
    const { data } = await admin.from('profiles').select('id').eq('email', input.email).maybeSingle();
    if (data) existingUserId = (data as unknown as { id: string }).id;
  }

  let created = false;
  let userId: string;

  if (existingUserId) {
    userId = existingUserId;
    // Update their name in profile if provided
    if (input.fullName) {
      await admin.from('profiles').update({ full_name: input.fullName }).eq('id', userId);
    }
  } else {
    // Create new auth user — handle_new_user trigger auto-creates profile
    const userPayload: Record<string, unknown> = {
      user_metadata: { full_name: input.fullName, staff_created: true },
    };
    if (normalizedPhone) { userPayload.phone = normalizedPhone; userPayload.phone_confirm = true; }
    if (input.email) { userPayload.email = input.email; userPayload.email_confirm = true; }

    const { data: authUser, error: createErr } = await admin.auth.admin.createUser(userPayload as Parameters<typeof admin.auth.admin.createUser>[0]);
    if (createErr || !authUser.user) throw createErr ?? new Error('Failed to create auth user');
    userId = authUser.user.id;

    // Wait for trigger to fire, then update full_name explicitly
    await admin.from('profiles').update({ full_name: input.fullName }).eq('id', userId);
    created = true;
  }

  // Upsert role — try insert, update on conflict
  const { error: insertErr } = await admin.from('user_tenant_roles').insert({
    user_id: userId,
    tenant_id: input.tenantId,
    branch_id: input.branchId ?? null,
    role: input.role as never,
    is_active: true,
    granted_by: input.actorId,
  } as never);

  if (insertErr) {
    if (insertErr.code === '23505') {
      // Already exists — activate it
      let q = admin.from('user_tenant_roles')
        .update({ is_active: true, granted_by: input.actorId } as never)
        .eq('user_id', userId)
        .eq('tenant_id', input.tenantId)
        .eq('role', input.role as never);
      if (input.branchId) q = q.eq('branch_id', input.branchId);
      else q = q.is('branch_id', null);
      await q;
    } else {
      throw insertErr;
    }
  }

  await admin.from('activity_log').insert({
    tenant_id: input.tenantId,
    actor_id: input.actorId,
    actor_role: 'manager' as never,
    action: 'staff.added',
    entity_type: 'staff',
    entity_id: userId,
    after: { role: input.role, branch_id: input.branchId, created } as never,
  });

  return { userId, created };
}

export async function updateStaffRole(input: {
  tenantId: string;
  userId: string;
  role: StaffRole;
  branchId?: string | null;
  actorId: string;
  actorRole: ActorRole;
}): Promise<void> {
  if (input.userId === input.actorId) throw new Error('cannot_modify_self');
  if (!canManage(input.actorRole, input.role)) throw new Error('privilege_escalation_denied');

  const admin = createAdminClient();

  // Replace: delete old role(s), insert new one
  await admin.from('user_tenant_roles')
    .delete()
    .eq('user_id', input.userId)
    .eq('tenant_id', input.tenantId)
    .in('role', STAFF_ROLES as never[]);

  await admin.from('user_tenant_roles').insert({
    user_id: input.userId,
    tenant_id: input.tenantId,
    branch_id: input.branchId ?? null,
    role: input.role as never,
    is_active: true,
    granted_by: input.actorId,
  } as never);

  await admin.from('activity_log').insert({
    tenant_id: input.tenantId,
    actor_id: input.actorId,
    actor_role: 'manager' as never,
    action: 'staff.role_changed',
    entity_type: 'staff',
    entity_id: input.userId,
    after: { role: input.role, branch_id: input.branchId } as never,
  });
}

export async function setStaffActive(
  tenantId: string, userId: string, isActive: boolean, actorId: string,
): Promise<void> {
  if (userId === actorId) throw new Error('cannot_modify_self');
  const admin = createAdminClient();
  await admin.from('user_tenant_roles')
    .update({ is_active: isActive } as never)
    .eq('user_id', userId)
    .eq('tenant_id', tenantId)
    .in('role', STAFF_ROLES as never[]);

  await admin.from('activity_log').insert({
    tenant_id: tenantId,
    actor_id: actorId,
    actor_role: 'manager' as never,
    action: isActive ? 'staff.activated' : 'staff.deactivated',
    entity_type: 'staff',
    entity_id: userId,
    after: { is_active: isActive } as never,
  });
}

export async function removeStaff(tenantId: string, userId: string, actorId: string): Promise<void> {
  if (userId === actorId) throw new Error('cannot_modify_self');
  const admin = createAdminClient();
  await admin.from('user_tenant_roles')
    .delete()
    .eq('user_id', userId)
    .eq('tenant_id', tenantId)
    .in('role', STAFF_ROLES as never[]);

  await admin.from('activity_log').insert({
    tenant_id: tenantId,
    actor_id: actorId,
    actor_role: 'manager' as never,
    action: 'staff.removed',
    entity_type: 'staff',
    entity_id: userId,
    after: null,
  });
}
