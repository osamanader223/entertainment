import { requireAuth, userHasAnyRole } from '@/lib/auth';
import { getWalletBalance } from '@/lib/wallet';
import { getLoyaltySummary } from '@/lib/loyalty';
import { getCustomerOffers } from '@/lib/offers';
import { getCustomerUpcomingBookings } from '@/lib/booking';
import { resolveBranchByCode, getPublicVenueState } from '@/lib/venue';
import { DashboardHomeContent } from '@/components/dashboard/dashboard-home';

export const metadata = { title: 'Dashboard' };
export const dynamic = 'force-dynamic';

const DEMO_TENANT_ID = '11111111-1111-1111-1111-111111111111';
const DEMO_BRANCH_CODE = 'JED-01';

export default async function DashboardPage() {
  const ctx = await requireAuth();

  const [walletBalanceCents, loyaltySummary, offers, upcomingBookings, branchId] = await Promise.all([
    getWalletBalance(DEMO_TENANT_ID, ctx.userId),
    getLoyaltySummary(DEMO_TENANT_ID, ctx.userId),
    getCustomerOffers({ tenantId: DEMO_TENANT_ID, customerId: ctx.userId }),
    getCustomerUpcomingBookings(DEMO_TENANT_ID, ctx.userId),
    resolveBranchByCode(DEMO_BRANCH_CODE),
  ]);
  const initialState = branchId ? await getPublicVenueState(branchId) : null;

  const canEndSessions = userHasAnyRole(ctx, ['staff', 'manager', 'tenant_admin']) || ctx.isSuperAdmin;

  return (
    <DashboardHomeContent
      userId={ctx.userId}
      userName={ctx.profile?.full_name?.split(' ')[0] || 'Player'}
      walletBalanceCents={walletBalanceCents}
      loyaltyPoints={loyaltySummary.pointsBalance}
      tier={loyaltySummary.tier}
      streakDays={loyaltySummary.currentStreakDays}
      branchCode={DEMO_BRANCH_CODE}
      initialState={initialState ?? undefined}
      canEndSessions={canEndSessions}
      offersEligible={offers.eligible}
      offersLocked={offers.locked}
      offersNextTier={loyaltySummary.nextTier}
      offersPointsToNextTier={loyaltySummary.pointsToNextTier}
      upcomingBookings={upcomingBookings}
    />
  );
}
