import { requireAuth, userHasAnyRole } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { listPricingRules } from '@/lib/pricing-admin';
import { getServerDict } from '@/i18n/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { PricingManager } from '@/components/admin/pricing-manager';

export const metadata = { title: 'Admin — Pricing' };
export const dynamic = 'force-dynamic';

const DEMO_TENANT_ID = '11111111-1111-1111-1111-111111111111';
const ADMIN_ROLES = ['manager', 'tenant_admin'] as const;

export default async function AdminPricingPage() {
  const ctx = await requireAuth('/login');
  if (!userHasAnyRole(ctx, [...ADMIN_ROLES]) && !ctx.isSuperAdmin) redirect('/dashboard');

  const { d } = await getServerDict();

  const admin = createAdminClient();
  const [rules, gameTypesRaw] = await Promise.all([
    listPricingRules(DEMO_TENANT_ID),
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
        <h1 className="text-3xl font-bold">{d.admin.pricingTitle}</h1>
        <p className="text-muted-foreground mt-1">{d.admin.pricingSubtitle}</p>
      </div>
      <PricingManager initialRules={rules} gameTypes={gameTypes} />
    </div>
  );
}
