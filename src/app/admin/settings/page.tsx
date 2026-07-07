import { requireAuth, userHasAnyRole } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { getServerDict } from '@/i18n/server';
import { getVenueSettings } from '@/lib/venue-settings';
import { SettingsForm } from '@/components/admin/settings-form';

export const metadata = { title: 'Admin — Settings' };
export const dynamic = 'force-dynamic';

const DEMO_TENANT_ID = '11111111-1111-1111-1111-111111111111';
const DEMO_BRANCH_ID = '22222222-2222-2222-2222-222222222222';
const ADMIN_ROLES = ['manager', 'tenant_admin'] as const;

export default async function AdminSettingsPage() {
  const ctx = await requireAuth('/login');
  if (!userHasAnyRole(ctx, [...ADMIN_ROLES]) && !ctx.isSuperAdmin) redirect('/dashboard');

  const { d } = await getServerDict();
  const settings = await getVenueSettings(DEMO_TENANT_ID, DEMO_BRANCH_ID);
  const canEditBranding = ctx.isSuperAdmin || userHasAnyRole(ctx, ['tenant_admin']);

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-3xl font-bold">{d.adminSettings.title}</h1>
        <p className="text-muted-foreground mt-1">{d.adminSettings.subtitle}</p>
      </div>
      <SettingsForm initialSettings={settings} canEditBranding={canEditBranding} />
    </div>
  );
}
