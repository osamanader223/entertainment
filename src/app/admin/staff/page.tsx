import { requireAuth, userHasAnyRole } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { listStaff } from '@/lib/staff';
import { getServerDict } from '@/i18n/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { StaffManager } from '@/components/admin/staff-manager';

export const metadata = { title: 'Admin — Staff' };
export const dynamic = 'force-dynamic';

const DEMO_TENANT_ID = '11111111-1111-1111-1111-111111111111';
const ADMIN_ROLES = ['manager', 'tenant_admin'] as const;

export default async function AdminStaffPage() {
  const ctx = await requireAuth('/login');
  if (!userHasAnyRole(ctx, [...ADMIN_ROLES]) && !ctx.isSuperAdmin) redirect('/dashboard');

  const { d } = await getServerDict();

  const admin = createAdminClient();
  const [staff, branchesRaw] = await Promise.all([
    listStaff(DEMO_TENANT_ID),
    admin.from('branches').select('id, display_name').eq('tenant_id', DEMO_TENANT_ID).eq('status', 'active'),
  ]);

  const branches = (branchesRaw.data ?? []) as unknown as Array<{ id: string; display_name: string }>;

  const isTenantAdmin = userHasAnyRole(ctx, ['tenant_admin']) || ctx.isSuperAdmin;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">{d.adminStaff.title}</h1>
        <p className="text-muted-foreground mt-1">{d.adminStaff.subtitle}</p>
      </div>
      <StaffManager
        initialStaff={staff}
        branches={branches}
        currentUserId={ctx.userId}
        canManageAdmin={isTenantAdmin}
      />
    </div>
  );
}
