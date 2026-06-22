import { requireAuth, userHasAnyRole } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { listStations } from '@/lib/stations-admin';
import { getServerDict } from '@/i18n/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { StationsManager } from '@/components/admin/stations-manager';

export const metadata = { title: 'Admin — Stations' };
export const dynamic = 'force-dynamic';

const DEMO_TENANT_ID = '11111111-1111-1111-1111-111111111111';
const DEMO_BRANCH_ID = '22222222-2222-2222-2222-222222222222';
const ADMIN_ROLES = ['manager', 'tenant_admin'] as const;

export default async function AdminStationsPage() {
  const ctx = await requireAuth('/login');
  if (!userHasAnyRole(ctx, [...ADMIN_ROLES]) && !ctx.isSuperAdmin) redirect('/dashboard');

  const { d } = await getServerDict();

  const admin = createAdminClient();
  const [stations, gameTypesRaw] = await Promise.all([
    listStations(DEMO_TENANT_ID, DEMO_BRANCH_ID),
    admin.from('game_types').select('id, display_name_en, display_name_ar, icon').eq('tenant_id', DEMO_TENANT_ID).eq('is_active', true).order('sort_order'),
  ]);

  const gameTypes = (gameTypesRaw.data ?? []) as unknown as Array<{
    id: string; display_name_en: string; display_name_ar: string; icon: string | null;
  }>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">{d.adminStations.title}</h1>
        <p className="text-muted-foreground mt-1">{d.adminStations.subtitle}</p>
      </div>
      <StationsManager initialStations={stations} gameTypes={gameTypes} />
    </div>
  );
}
