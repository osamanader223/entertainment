import { requireAuth, userHasAnyRole } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { getWalletBalance } from '@/lib/wallet';
import { resolveBranchByCode, getPublicVenueState } from '@/lib/venue';
import { DashboardHomeContent } from '@/components/dashboard/dashboard-home';

export const metadata = { title: 'Dashboard' };
export const dynamic = 'force-dynamic';

const DEMO_TENANT_ID = '11111111-1111-1111-1111-111111111111';
const DEMO_BRANCH_CODE = 'JED-01';

export default async function DashboardPage() {
  const ctx = await requireAuth();
  const supabase = await createClient();

  const { data: loyaltyAccount } = await supabase
    .from('loyalty_accounts')
    .select('points_balance, tier, current_streak_days')
    .eq('customer_id', ctx.userId)
    .eq('tenant_id', DEMO_TENANT_ID)
    .maybeSingle();

  const walletBalanceCents = await getWalletBalance(DEMO_TENANT_ID, ctx.userId);

  const branchId = await resolveBranchByCode(DEMO_BRANCH_CODE);
  const initialState = branchId ? await getPublicVenueState(branchId) : null;

  const canEndSessions = userHasAnyRole(ctx, ['staff', 'manager', 'tenant_admin']) || ctx.isSuperAdmin;

  return (
    <DashboardHomeContent
      userName={ctx.profile?.full_name?.split(' ')[0] || 'Player'}
      walletBalanceCents={walletBalanceCents}
      loyaltyPoints={loyaltyAccount?.points_balance ?? 0}
      tier={loyaltyAccount?.tier ?? 'silver'}
      streakDays={loyaltyAccount?.current_streak_days ?? 0}
      branchCode={DEMO_BRANCH_CODE}
      initialState={initialState ?? undefined}
      canEndSessions={canEndSessions}
    />
  );
}
