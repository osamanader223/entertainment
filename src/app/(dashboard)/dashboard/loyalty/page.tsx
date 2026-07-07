import Link from 'next/link';
import { requireAuth } from '@/lib/auth';
import { getLoyaltySummary, TIER_THRESHOLDS, type LoyaltyTier } from '@/lib/loyalty';
import { getServerDict } from '@/i18n/server';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ArrowLeft, Flame } from 'lucide-react';
import { cn } from '@/lib/utils';

export const metadata = { title: 'Loyalty' };
export const dynamic = 'force-dynamic';

const DEMO_TENANT_ID = '11111111-1111-1111-1111-111111111111';

const TIER_ORDER: LoyaltyTier[] = ['silver', 'gold', 'platinum', 'diamond'];
const TIER_EMBLEM: Record<LoyaltyTier, string> = {
  silver: '🥈',
  gold: '🥇',
  platinum: '💎',
  diamond: '💠',
};
const TIER_GLOW: Record<LoyaltyTier, string> = {
  silver: 'border-slate-400/30 bg-slate-400/10',
  gold: 'border-gold-500/30 bg-gold-500/10',
  platinum: 'border-cyan-400/30 bg-cyan-400/10',
  diamond: 'border-violet-400/30 bg-violet-400/10',
};

export default async function LoyaltyPage() {
  const ctx = await requireAuth();
  const { d } = await getServerDict();

  const summary = await getLoyaltySummary(DEMO_TENANT_ID, ctx.userId);

  const nextThreshold = summary.nextTier ? TIER_THRESHOLDS[summary.nextTier] : null;
  const currentThreshold = TIER_THRESHOLDS[summary.tier];
  const progressPercent =
    nextThreshold !== null
      ? Math.min(
          100,
          Math.max(
            0,
            ((summary.lifetimePointsEarned - currentThreshold) / (nextThreshold - currentThreshold)) * 100,
          ),
        )
      : 100;

  return (
    <div className="space-y-6 max-w-2xl">
      <Button variant="ghost" size="sm" asChild className="-ml-2">
        <Link href="/dashboard">
          <ArrowLeft className="h-4 w-4" />
          {d.nav.overview}
        </Link>
      </Button>

      <div>
        <h1 className="text-3xl font-bold">{d.loyalty.title}</h1>
        <p className="text-muted-foreground mt-1">{d.loyalty.subtitle}</p>
      </div>

      {/* Tier + points hero card */}
      <Card className={cn('glass', TIER_GLOW[summary.tier])}>
        <CardContent className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-4xl" aria-hidden>
                {TIER_EMBLEM[summary.tier]}
              </span>
              <div>
                <div className="text-xs text-muted-foreground">{d.loyalty.currentTier}</div>
                <div className="text-xl font-bold">{d.loyalty.tier[summary.tier]}</div>
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs text-muted-foreground">{d.loyalty.pointsBalance}</div>
              <div className="text-3xl font-bold text-gradient-gold font-mono tabular-nums">
                {summary.pointsBalance.toLocaleString()}
              </div>
            </div>
          </div>

          {/* Progress to next tier */}
          <div className="space-y-1.5">
            {summary.nextTier ? (
              <>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>
                    {d.loyalty.pointsToNextTier.replace('{points}', (summary.pointsToNextTier ?? 0).toLocaleString()).replace('{tier}', d.loyalty.tier[summary.nextTier])}
                  </span>
                  <span className="font-mono">{Math.round(progressPercent)}%</span>
                </div>
                <div className="h-2 w-full rounded-full bg-muted/40 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-gold-500 to-gold-300 transition-all"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
              </>
            ) : (
              <div className="text-center text-sm font-semibold text-gradient-gold py-1">
                {d.loyalty.topTierReached} 🎉
              </div>
            )}
          </div>

          {/* Streak */}
          <div className="flex items-center gap-2 text-sm">
            <Flame className="h-4 w-4 text-gold-400" />
            <span className="font-mono font-semibold">{summary.currentStreakDays}</span>
            <span className="text-muted-foreground">{d.loyalty.dayStreak}</span>
          </div>
        </CardContent>
      </Card>

      {/* Tier ladder */}
      <div className="space-y-2">
        <h2 className="text-lg font-semibold">{d.loyalty.tiersTitle}</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {TIER_ORDER.map((tier) => {
            const isCurrent = tier === summary.tier;
            return (
              <Card key={tier} className={cn('glass', isCurrent && TIER_GLOW[tier])}>
                <CardContent className="p-4 text-center space-y-1">
                  <div className="text-2xl" aria-hidden>
                    {TIER_EMBLEM[tier]}
                  </div>
                  <div className={cn('text-sm font-semibold', isCurrent && 'text-gradient-gold')}>
                    {d.loyalty.tier[tier]}
                  </div>
                  <div className="text-xs text-muted-foreground font-mono">
                    {TIER_THRESHOLDS[tier].toLocaleString()}+
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Recent activity */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold">{d.loyalty.recentActivity}</h2>
        {summary.recentLedger.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">{d.loyalty.noActivity}</p>
        ) : (
          <div className="space-y-2">
            {summary.recentLedger.map((entry, i) => {
              const isCredit = entry.delta > 0;
              return (
                <div
                  key={i}
                  className="flex items-center justify-between rounded-lg border border-border/60 bg-card/40 px-4 py-3"
                >
                  <div>
                    <div className="text-sm font-medium">{reasonLabel(d, entry.reason)}</div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(entry.createdAt).toLocaleDateString('en-US')}
                    </div>
                  </div>
                  <div
                    className={cn(
                      'font-mono font-semibold tabular-nums',
                      isCredit ? 'text-emerald-400' : 'text-rose-400',
                    )}
                  >
                    {isCredit ? '+' : '−'}
                    {Math.abs(entry.delta).toLocaleString()}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function reasonLabel(d: Awaited<ReturnType<typeof getServerDict>>['d'], reason: string): string {
  const map = d.loyalty.reason as Record<string, string>;
  return map[reason] ?? reason;
}
