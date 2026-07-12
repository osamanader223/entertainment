'use client';

import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { DashboardLiveGrid } from '@/components/venue/dashboard-live-grid';
import { OffersShowcase } from '@/components/offers/offers-showcase';
import { UpcomingBookings } from '@/components/booking/upcoming-bookings';
import { Activity, Trophy, Wallet, ExternalLink, CalendarPlus, Ticket } from 'lucide-react';
import { formatMoney } from '@/lib/utils';
import { useT } from '@/i18n/context';
import type { PublicVenueState } from '@/lib/venue';
import type { CustomerOfferCard, LockedCustomerOfferCard } from '@/lib/offers';
import type { CustomerUpcomingBooking } from '@/lib/booking';

interface DashboardHomeProps {
  userId: string;
  userName: string;
  walletBalanceCents: number;
  loyaltyPoints: number;
  tier: string;
  streakDays: number;
  branchCode: string;
  initialState?: PublicVenueState;
  canEndSessions: boolean;
  offersEligible: CustomerOfferCard[];
  offersLocked: LockedCustomerOfferCard[];
  offersNextTier: string | null;
  offersPointsToNextTier: number | null;
  upcomingBookings: CustomerUpcomingBooking[];
}

export function DashboardHomeContent({
  userId,
  userName,
  walletBalanceCents,
  loyaltyPoints,
  tier,
  streakDays,
  branchCode,
  initialState,
  canEndSessions,
  offersEligible,
  offersLocked,
  offersNextTier,
  offersPointsToNextTier,
  upcomingBookings,
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
        <Link
          href={`/v/${branchCode}`}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          {t('dashboard.publicView')}
        </Link>
      </div>

      {/* Big, unmissable primary actions */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Link
          href="/dashboard/book"
          className="group relative overflow-hidden rounded-2xl border-2 border-gold-500/40 bg-gradient-to-br from-gold-500/25 via-gold-500/10 to-transparent p-6 sm:p-8 shadow-lg shadow-gold-500/10 transition-all duration-200 hover:border-gold-500/70 hover:shadow-gold-500/20 hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.99]"
        >
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-gold-500/20 text-4xl transition-transform group-hover:scale-110">
              <CalendarPlus className="h-8 w-8 text-gold-400" />
            </div>
            <div className="min-w-0">
              <div className="text-2xl font-extrabold text-gradient-gold">{t('dashboard.bookStation')}</div>
              <div className="text-sm text-muted-foreground mt-1">{t('dashboard.bookStationSubtitle')}</div>
            </div>
          </div>
        </Link>

        <Link
          href="/dashboard/queue"
          className="group relative overflow-hidden rounded-2xl border-2 border-border/60 bg-card/50 p-6 sm:p-8 shadow-lg transition-all duration-200 hover:border-gold-500/50 hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.99]"
        >
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-muted/30 text-4xl transition-transform group-hover:scale-110">
              <Ticket className="h-8 w-8" />
            </div>
            <div className="min-w-0">
              <div className="text-2xl font-extrabold">{t('dashboard.joinQueue')}</div>
              <div className="text-sm text-muted-foreground mt-1">{t('dashboard.joinQueueSubtitle')}</div>
            </div>
          </div>
        </Link>
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

      <UpcomingBookings customerId={userId} initialBookings={upcomingBookings} />

      <OffersShowcase
        eligible={offersEligible}
        locked={offersLocked}
        nextTier={offersNextTier}
        pointsToNextTier={offersPointsToNextTier}
      />

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
