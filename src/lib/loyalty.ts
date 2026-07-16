import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

export type LoyaltyTier = 'silver' | 'gold' | 'platinum' | 'diamond';

/** Tier thresholds (lifetime points earned). Single source of truth. */
export const TIER_THRESHOLDS: Record<LoyaltyTier, number> = {
  silver: 0,
  gold: 250,
  platinum: 1000,
  diamond: 3000,
};

const TIER_ORDER: LoyaltyTier[] = ['silver', 'gold', 'platinum', 'diamond'];

/** Given lifetime points, return the tier the customer qualifies for. */
export function tierForLifetimePoints(lifetimePoints: number): LoyaltyTier {
  if (lifetimePoints >= TIER_THRESHOLDS.diamond) return 'diamond';
  if (lifetimePoints >= TIER_THRESHOLDS.platinum) return 'platinum';
  if (lifetimePoints >= TIER_THRESHOLDS.gold) return 'gold';
  return 'silver';
}

/**
 * Points earned = 1 per SAR paid. Amounts are in halalas (cents).
 * 100 halalas = 1 SAR = 1 point. doublePoints doubles it.
 */
export function computePointsEarned(amountCentsPaid: number, doublePoints: boolean): number {
  return Math.floor(amountCentsPaid / 100) * (doublePoints ? 2 : 1);
}

export interface AwardPointsResult {
  pointsAwarded: number;
  newBalance: number;
  newLifetime: number;
  previousTier: LoyaltyTier;
  newTier: LoyaltyTier;
  tierUp: boolean;
}

/**
 * Award points to a customer (idempotent per reference + reason). Creates
 * the loyalty account if missing. Delegates to the loyalty_award_points
 * Postgres function for atomicity — see supabase/migrations/00008_loyalty.sql.
 */
export async function awardPoints(input: {
  tenantId: string;
  customerId: string;
  points: number;
  reason: string;
  referenceType: string;
  referenceId: string;
  actorId?: string;
}): Promise<AwardPointsResult> {
  // Nothing to award (e.g. a fully-discounted session) — skip the round trip.
  if (input.points <= 0) {
    const admin = createAdminClient();
    const { data } = await admin
      .from('loyalty_accounts')
      .select('points_balance, lifetime_points_earned, tier')
      .eq('tenant_id', input.tenantId)
      .eq('customer_id', input.customerId)
      .maybeSingle();
    const tier = (data?.tier as LoyaltyTier | undefined) ?? 'silver';
    return {
      pointsAwarded: 0,
      newBalance: data?.points_balance ?? 0,
      newLifetime: data?.lifetime_points_earned ?? 0,
      previousTier: tier,
      newTier: tier,
      tierUp: false,
    };
  }

  const admin = createAdminClient();
  const { data, error } = await admin.rpc('loyalty_award_points', {
    p_tenant_id: input.tenantId,
    p_customer_id: input.customerId,
    p_points: input.points,
    p_reason: input.reason,
    p_reference_type: input.referenceType,
    p_reference_id: input.referenceId,
    p_actor_id: input.actorId ?? null,
  });
  if (error) throw error;

  const result = data as {
    points_awarded: number;
    new_balance: number;
    new_lifetime: number;
    previous_tier: LoyaltyTier;
    new_tier: LoyaltyTier;
    tier_up: boolean;
  };

  return {
    pointsAwarded: result.points_awarded,
    newBalance: Number(result.new_balance),
    newLifetime: Number(result.new_lifetime),
    previousTier: result.previous_tier,
    newTier: result.new_tier,
    tierUp: result.tier_up,
  };
}

export interface LoyaltyLedgerEntry {
  delta: number;
  reason: string;
  createdAt: string;
}

export interface LoyaltySummary {
  pointsBalance: number;
  lifetimePointsEarned: number;
  tier: LoyaltyTier;
  currentStreakDays: number;
  longestStreakDays: number;
  nextTier: LoyaltyTier | null;
  pointsToNextTier: number | null;
  recentLedger: LoyaltyLedgerEntry[];
}

/** Read a customer's loyalty summary (for dashboard + a dedicated loyalty page). */
export async function getLoyaltySummary(tenantId: string, customerId: string): Promise<LoyaltySummary> {
  const supabase = await createClient();

  const { data: accountRaw } = await supabase
    .from('loyalty_accounts')
    .select('id, points_balance, lifetime_points_earned, tier, current_streak_days, longest_streak_days')
    .eq('tenant_id', tenantId)
    .eq('customer_id', customerId)
    .maybeSingle();
  const account = accountRaw as unknown as {
    id: string;
    points_balance: number;
    lifetime_points_earned: number;
    tier: LoyaltyTier;
    current_streak_days: number;
    longest_streak_days: number;
  } | null;

  const tier = tierForLifetimePoints(account?.lifetime_points_earned ?? 0);
  const tierIdx = TIER_ORDER.indexOf(tier);
  const nextTier = tierIdx < TIER_ORDER.length - 1 ? TIER_ORDER[tierIdx + 1] : null;
  const pointsToNextTier = nextTier ? TIER_THRESHOLDS[nextTier] - (account?.lifetime_points_earned ?? 0) : null;

  let recentLedger: LoyaltyLedgerEntry[] = [];
  if (account?.id) {
    const { data: ledgerRaw } = await supabase
      .from('loyalty_ledger')
      .select('delta_points, reason, created_at')
      .eq('account_id', account.id)
      .order('created_at', { ascending: false })
      .limit(20);
    const ledgerRows = ledgerRaw as unknown as
      | Array<{ delta_points: number; reason: string; created_at: string }>
      | null;
    recentLedger = (ledgerRows ?? []).map((r) => ({
      delta: r.delta_points,
      reason: r.reason,
      createdAt: r.created_at,
    }));
  }

  return {
    pointsBalance: account?.points_balance ?? 0,
    lifetimePointsEarned: account?.lifetime_points_earned ?? 0,
    tier,
    currentStreakDays: account?.current_streak_days ?? 0,
    longestStreakDays: account?.longest_streak_days ?? 0,
    nextTier,
    pointsToNextTier: pointsToNextTier !== null ? Math.max(0, pointsToNextTier) : null,
    recentLedger,
  };
}

/**
 * Total captured spend for a customer — self-service, RLS-scoped (the
 * payments_customer_self policy lets a customer read their own captured
 * payments). Used on their own /dashboard/profile page.
 */
export async function getCustomerTotalSpentCents(tenantId: string, customerId: string): Promise<number> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('payments')
    .select('amount_cents')
    .eq('tenant_id', tenantId)
    .eq('customer_id', customerId)
    .eq('status', 'captured');
  const rows = (data ?? []) as unknown as Array<{ amount_cents: number }>;
  return rows.reduce((sum, p) => sum + p.amount_cents, 0);
}
