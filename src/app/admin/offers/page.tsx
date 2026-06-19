import { requireAuth, userHasAnyRole } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { listOffers } from '@/lib/offers';
import { getServerDict } from '@/i18n/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { OffersManager } from '@/components/admin/offers-manager';

export const metadata = { title: 'Admin — Offers' };
export const dynamic = 'force-dynamic';

const DEMO_TENANT_ID = '11111111-1111-1111-1111-111111111111';
const ADMIN_ROLES = ['manager', 'tenant_admin'] as const;

export default async function AdminOffersPage() {
  const ctx = await requireAuth('/login');
  if (!userHasAnyRole(ctx, [...ADMIN_ROLES]) && !ctx.isSuperAdmin) redirect('/dashboard');

  const { d } = await getServerDict();

  const admin = createAdminClient();
  const [offers, gameTypesRaw] = await Promise.all([
    listOffers(DEMO_TENANT_ID),
    admin
      .from('game_types')
      .select('id, display_name_en, display_name_ar')
      .eq('tenant_id', DEMO_TENANT_ID)
      .eq('is_active', true)
      .order('display_name_en'),
  ]);

  const gameTypes = (gameTypesRaw.data ?? []) as unknown as Array<{
    id: string;
    display_name_en: string;
    display_name_ar: string;
  }>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">{d.admin.offersTitle}</h1>
        <p className="text-muted-foreground mt-1">{d.admin.offersSubtitle}</p>
      </div>
      <OffersManager initialOffers={offers} gameTypes={gameTypes} />
    </div>
  );
}
