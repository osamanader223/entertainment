import { requireAuth, userHasAnyRole } from '@/lib/auth';
import { getWalletBalance, getWalletLedger } from '@/lib/wallet';
import { getLoyaltySummary, TIER_THRESHOLDS } from '@/lib/loyalty';
import { getCustomerOffers } from '@/lib/offers';
import { getCustomerUpcomingBookings } from '@/lib/booking';
import { resolveBranchByCode, getPublicVenueState } from '@/lib/venue';
import { computeSessionPrice } from '@/lib/cashier';
import { getQueueableGameTypes } from '@/lib/queue';
import { DashboardHomeContent } from '@/components/dashboard/dashboard-home';

export const metadata = { title: 'Dashboard' };
export const dynamic = 'force-dynamic';

const DEMO_TENANT_ID = '11111111-1111-1111-1111-111111111111';
const DEMO_BRANCH_CODE = 'JED-01';

export default async function DashboardPage() {
  const ctx = await requireAuth();

  const [walletBalanceCents, loyaltySummary, offers, upcomingBookings, branchId, walletLedger, gameTypes] = await Promise.all([
    getWalletBalance(DEMO_TENANT_ID, ctx.userId),
    getLoyaltySummary(DEMO_TENANT_ID, ctx.userId),
    getCustomerOffers({ tenantId: DEMO_TENANT_ID, customerId: ctx.userId }),
    getCustomerUpcomingBookings(DEMO_TENANT_ID, ctx.userId),
    resolveBranchByCode(DEMO_BRANCH_CODE),
    getWalletLedger(DEMO_TENANT_ID, ctx.userId, 20),
    getQueueableGameTypes(DEMO_TENANT_ID),
  ]);
  const initialState = branchId ? await getPublicVenueState(branchId) : null;

  const canEndSessions = userHasAnyRole(ctx, ['staff', 'manager', 'tenant_admin']) || ctx.isSuperAdmin;

  // Loyalty progress bar: points earned within the current tier / the tier's span.
  const currentFloor = TIER_THRESHOLDS[loyaltySummary.tier];
  const nextCeiling = loyaltySummary.nextTier ? TIER_THRESHOLDS[loyaltySummary.nextTier] : null;
  const progressPct = nextCeiling
    ? Math.max(0, Math.min(1, (loyaltySummary.lifetimePointsEarned - currentFloor) / (nextCeiling - currentFloor)))
    : 1;

  const ledgerRows = walletLedger as unknown as Array<{ kind: string; created_at: string }>;
  const lastTopUp = ledgerRows.find((e) => e.kind === 'credit_topup');
  const lastTopUpAt = lastTopUp?.created_at ?? null;

  // Real hourly price per game type present at this branch, for the station cards
  // (the mockup's "SAR/hr" figure) — computed from our actual pricing rules, not hardcoded.
  const gameTypeByCode = new Map(gameTypes.map((g) => [g.code, g]));
  const presentCodes = branchId && initialState ? [...new Set(initialState.stations.map((s) => s.game_type_code))] : [];
  const priceEntries = await Promise.all(
    presentCodes.map(async (code): Promise<[string, number | null]> => {
      const gt = gameTypeByCode.get(code);
      if (!gt || !branchId) return [code, null];
      try {
        const cents = await computeSessionPrice({ gameTypeId: gt.id, durationMinutes: 60, branchId });
        return [code, cents];
      } catch {
        return [code, null];
      }
    }),
  );
  const hourlyPriceCentsByGameTypeCode = Object.fromEntries(priceEntries);
  const gameTypeIdByCode = Object.fromEntries(gameTypes.map((g) => [g.code, g.id]));

  return (
    <DashboardHomeContent
      userId={ctx.userId}
      userName={ctx.profile?.full_name?.split(' ')[0] || 'Player'}
      walletBalanceCents={walletBalanceCents}
      lastTopUpAt={lastTopUpAt}
      loyaltyPoints={loyaltySummary.pointsBalance}
      tier={loyaltySummary.tier}
      nextTier={loyaltySummary.nextTier}
      pointsToNextTier={loyaltySummary.pointsToNextTier}
      progressPct={progressPct}
      streakDays={loyaltySummary.currentStreakDays}
      branchCode={DEMO_BRANCH_CODE}
      initialState={initialState ?? undefined}
      canEndSessions={canEndSessions}
      offersEligible={offers.eligible}
      offersLocked={offers.locked}
      offersNextTier={loyaltySummary.nextTier}
      offersPointsToNextTier={loyaltySummary.pointsToNextTier}
      upcomingBookings={upcomingBookings}
      hourlyPriceCentsByGameTypeCode={hourlyPriceCentsByGameTypeCode}
      gameTypeIdByCode={gameTypeIdByCode}
    />
  );
}
