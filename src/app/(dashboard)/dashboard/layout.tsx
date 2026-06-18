import { requireAuth, userHasAnyRole } from '@/lib/auth';
import { DashboardHeader } from '@/components/dashboard/dashboard-header';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireAuth('/dashboard');
  const isStaff = userHasAnyRole(ctx, ['staff', 'manager', 'tenant_admin']) || ctx.isSuperAdmin;
  const userName = ctx.profile?.full_name || ctx.email || ctx.phone || null;

  return (
    <div className="min-h-screen flex flex-col">
      <DashboardHeader userName={userName} isStaff={isStaff} />
      <main className="flex-1 max-w-7xl mx-auto w-full px-6 py-8">{children}</main>
    </div>
  );
}
