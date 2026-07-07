'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { DashboardLiveGrid } from '@/components/venue/dashboard-live-grid';
import { Activity, Trophy, Wallet, ExternalLink, CalendarPlus, Ticket } from 'lucide-react';
import { formatMoney } from '@/lib/utils';
import { useT } from '@/i18n/context';
import type { PublicVenueState } from '@/lib/venue';

interface DashboardHomeProps {
  userName: string;
  walletBalanceCents: number;
  loyaltyPoints: number;
  tier: string;
  streakDays: number;
  branchCode: string;
  initialState?: PublicVenueState;
  canEndSessions: boolean;
}

export function DashboardHomeContent({
  userName,
  walletBalanceCents,
  loyaltyPoints,
  tier,
  streakDays,
  branchCode,
  initialState,
  canEndSessions,
}: DashboardHomeProps) {
  const { t } = useT();

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">
            {t('dashboard.welcome')},{' '}
            <span className="text-gradient-gold">{userName}</span>{' '}
            👋
          </h1>
          <p className="text-muted-foreground mt-1">{t('dashboard.liveVenueStatus')}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="gold" size="lg" asChild>
            <Link href="/dashboard/book">
              <CalendarPlus className="h-4 w-4" />
              {t('dashboard.bookStation')}
            </Link>
          </Button>
          <Button variant="outline" size="lg" asChild>
            <Link href="/dashboard/queue">
              <Ticket className="h-4 w-4" />
              {t('dashboard.joinQueue')}
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href={`/v/${branchCode}`}>
              <ExternalLink className="h-4 w-4" />
              {t('dashboard.publicView')}
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          icon={<Wallet className="h-5 w-5" />}
          label={t('dashboard.walletCredit')}
          value={formatMoney(walletBalanceCents)}
          accent={walletBalanceCents > 0}
          href="/dashboard/wallet"
        />
        <StatCard
          icon={<Trophy className="h-5 w-5" />}
          label={t('dashboard.loyaltyPoints')}
          value={loyaltyPoints.toLocaleString()}
          hint={`${t('dashboard.tier')}: ${t(`loyalty.tier.${tier}`)}`}
          href="/dashboard/loyalty"
        />
        <StatCard
          icon={<Activity className="h-5 w-5" />}
          label={t('dashboard.streak')}
          value={`${streakDays} ${t('dashboard.days')}`}
        />
      </div>

      <section className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-xl font-semibold">{t('dashboard.liveStations')}</h2>
          <span className="text-xs text-muted-foreground">{t('dashboard.tapFreeStation')}</span>
        </div>
        <DashboardLiveGrid
          branchCode={branchCode}
          initial={initialState}
          canEndSessions={canEndSessions}
        />
      </section>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  hint,
  href,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
  href?: string;
  accent?: boolean;
}) {
  const inner = (
    <Card className={accent ? 'glass border-gold-500/30' : 'glass'}>
      <CardContent className="p-5">
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          <span className={accent ? 'text-gold-400' : ''}>{icon}</span>
          {label}
        </div>
        <div className={`mt-3 text-3xl font-bold ${accent ? 'text-gradient-gold' : ''}`}>
          {value}
        </div>
        {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
      </CardContent>
    </Card>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}
