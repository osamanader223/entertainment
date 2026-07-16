'use client';

import Link from 'next/link';
import { Wallet, Star, Flame, ListChecks, CalendarCheck2 } from 'lucide-react';
import { NeonDashboardShell } from './neon-dashboard-shell';
import { NeonLoyaltyModule } from './neon-loyalty-module';
import { DashboardLiveGrid } from '@/components/venue/dashboard-live-grid';
import { OffersShowcase } from '@/components/offers/offers-showcase';
import { UpcomingBookings } from '@/components/booking/upcoming-bookings';
import { formatMoney } from '@/lib/utils';
import { useT } from '@/i18n/context';
import type { PublicVenueState } from '@/lib/venue';
import type { CustomerOfferCard, LockedCustomerOfferCard } from '@/lib/offers';
import type { CustomerUpcomingBooking } from '@/lib/booking';
import type { LoyaltyTier } from '@/lib/loyalty';

interface DashboardHomeProps {
  userId: string;
  userName: string;
  walletBalanceCents: number;
  lastTopUpAt: string | null;
  loyaltyPoints: number;
  tier: LoyaltyTier;
  nextTier: LoyaltyTier | null;
  pointsToNextTier: number | null;
  progressPct: number;
  streakDays: number;
  branchCode: string;
  initialState?: PublicVenueState;
  canEndSessions: boolean;
  offersEligible: CustomerOfferCard[];
  offersLocked: LockedCustomerOfferCard[];
  offersNextTier: string | null;
  offersPointsToNextTier: number | null;
  upcomingBookings: CustomerUpcomingBooking[];
  hourlyPriceCentsByGameTypeCode: Record<string, number | null>;
  gameTypeIdByCode: Record<string, string>;
}

// Neon-arcade dashboard redesign — see design_handoff_bolos_alley/README.md.
// Screen order per the handoff: greeting -> two CTAs -> stat cards -> loyalty
// module -> offers -> stations, with upcoming bookings kept (real feature,
// not in the mockup) between stats and loyalty.
export function DashboardHomeContent({
  userId,
  userName,
  walletBalanceCents,
  lastTopUpAt,
  loyaltyPoints,
  tier,
  nextTier,
  pointsToNextTier,
  progressPct,
  streakDays,
  branchCode,
  initialState,
  canEndSessions,
  offersEligible,
  offersLocked,
  offersNextTier,
  offersPointsToNextTier,
  upcomingBookings,
  hourlyPriceCentsByGameTypeCode,
  gameTypeIdByCode,
}: DashboardHomeProps) {
  const { t, locale } = useT();
  const avatarLetter = locale === 'ar' ? 'أ' : (userName.trim()[0]?.toUpperCase() ?? '?');
  const tierWord = t(`loyalty.tier.${tier}`);

  const lastTopUpLabel = (() => {
    if (!lastTopUpAt) return t('dashboard.noTopUpsYet');
    const days = Math.floor((Date.now() - new Date(lastTopUpAt).getTime()) / 86_400_000);
    if (days <= 0) return t('dashboard.lastTopUp', { when: t('scheduling.startingNow') });
    if (days === 1) return t('dashboard.lastTopUp', { when: t('dashboard.oneDayAgo') });
    return t('dashboard.lastTopUp', { when: t('dashboard.daysAgo', { n: String(days) }) });
  })();

  return (
    <NeonDashboardShell userName={userName} tierWord={tierWord}>
      {/* Greeting header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="h-[9px] w-[9px] rounded-full bg-[color:var(--neon-cyan)] animate-bolosPulse" />
            <span className="text-[13px] font-bold" style={{ color: '#8FEFEF' }}>{t('dashboard.liveNow')}</span>
          </div>
          <div className="text-[26px] font-extrabold leading-[1.15] text-[color:var(--neon-text-hi)]">
            {t('dashboard.welcome', { name: userName })}
          </div>
          <div className="text-[14px] mt-1" style={{ color: 'var(--neon-text-mid)' }}>{t('dashboard.liveVenueStatus')}</div>
        </div>
        <div
          className="h-11 w-11 shrink-0 rounded-full flex items-center justify-center text-white font-extrabold text-base xl:hidden"
          style={{ background: 'linear-gradient(135deg,#FF2D9E,#7B2FF7)', boxShadow: '0 0 20px -4px rgba(255,45,158,.6)' }}
        >
          {avatarLetter}
        </div>
      </div>

      {/* THE two dominant CTAs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 sm:gap-[18px]">
        <Link
          href="/dashboard/queue"
          className="relative overflow-hidden rounded-[22px] p-6 sm:p-[26px] min-h-[150px] flex flex-col justify-between text-white animate-bolosGlow"
          style={{ background: 'linear-gradient(140deg,#FF2D9E 0%,#B520C9 45%,#7B2FF7 100%)' }}
        >
          <span className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(120px 120px at 85% 15%, rgba(255,255,255,.25), transparent 70%)' }} />
          <span className="relative h-[52px] w-[52px] rounded-2xl flex items-center justify-center bg-white/[.16]">
            <ListChecks className="h-6 w-6" />
          </span>
          <span className="relative">
            <span className="block text-2xl font-extrabold leading-[1.15]">{t('dashboard.joinQueue')}</span>
            <span className="block text-sm opacity-90 mt-1.5">{t('dashboard.joinQueueSubtitle')}</span>
          </span>
        </Link>

        <Link
          href="/dashboard/book"
          className="relative overflow-hidden rounded-[22px] p-6 sm:p-[26px] min-h-[150px] flex flex-col justify-between text-white border"
          style={{
            background: 'linear-gradient(140deg,#7B2FF7 0%,#5A1FC0 50%,#2A1466 100%)',
            boxShadow: '0 0 30px -10px rgba(123,47,247,.7)',
            borderColor: 'rgba(127,233,255,.22)',
          }}
        >
          <span className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(120px 120px at 85% 15%, rgba(47,243,243,.2), transparent 70%)' }} />
          <span className="relative h-[52px] w-[52px] rounded-2xl flex items-center justify-center" style={{ background: 'rgba(47,243,243,.16)', color: 'var(--neon-cyan-lt)' }}>
            <CalendarCheck2 className="h-6 w-6" />
          </span>
          <span className="relative">
            <span className="block text-2xl font-extrabold leading-[1.15]">{t('dashboard.bookStation')}</span>
            <span className="block text-sm opacity-90 mt-1.5">{t('dashboard.bookStationSubtitle')}</span>
          </span>
        </Link>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        <StatCard
          icon={<Wallet className="h-5 w-5" />}
          iconBg="rgba(47,243,243,.12)"
          iconColor="var(--neon-cyan)"
          label={t('dashboard.walletCredit')}
          value={formatMoney(walletBalanceCents).replace(/[^\d.,]/g, '')}
          unit="SAR"
          valueColor="var(--neon-text-hi)"
          glow="0 0 24px rgba(47,243,243,.25)"
          foot={lastTopUpLabel}
        />
        <StatCard
          icon={<Star className="h-5 w-5" />}
          iconBg="rgba(255,45,158,.14)"
          iconColor="var(--neon-magenta-soft)"
          label={t('dashboard.loyaltyPoints')}
          value={loyaltyPoints.toLocaleString('en-US')}
          unit={t('dashboard.pointsUnit')}
          valueColor="var(--neon-magenta-soft)"
          glow="0 0 24px rgba(255,45,158,.35)"
          foot={`${t('dashboard.tier')}: ${tierWord}`}
        />
        <StatCard
          icon={<Flame className="h-5 w-5" />}
          iconBg="rgba(123,47,247,.16)"
          iconColor="var(--neon-purple-lt)"
          label={t('dashboard.streak')}
          value={String(streakDays)}
          unit={t('dashboard.days')}
          valueColor="var(--neon-purple-lt)"
          glow="0 0 24px rgba(123,47,247,.3)"
          foot={t('dashboard.playTomorrow')}
        />
      </div>

      <UpcomingBookings customerId={userId} initialBookings={upcomingBookings} />

      <NeonLoyaltyModule
        tier={tier}
        pointsBalance={loyaltyPoints}
        nextTier={nextTier}
        pointsToNextTier={pointsToNextTier}
        progressPct={progressPct}
      />

      <OffersShowcase
        eligible={offersEligible}
        locked={offersLocked}
        nextTier={offersNextTier}
        pointsToNextTier={offersPointsToNextTier}
      />

      <section className="flex flex-col gap-3.5">
        <div className="flex items-center justify-between">
          <span className="text-xl font-extrabold text-[color:var(--neon-text-hi)]">{t('dashboard.liveStations')}</span>
          <Link
            href={`/v/${branchCode}`}
            title={t('dashboard.publicView')}
            className="h-9 w-9 rounded-[10px] border flex items-center justify-center text-[color:var(--neon-text-mid)]"
            style={{ borderColor: '#241E36', background: '#111018' }}
          >
            <CalendarCheck2 className="h-4 w-4" />
          </Link>
        </div>
        <DashboardLiveGrid
          branchCode={branchCode}
          initial={initialState}
          canEndSessions={canEndSessions}
          hourlyPriceCentsByGameTypeCode={hourlyPriceCentsByGameTypeCode}
          gameTypeIdByCode={gameTypeIdByCode}
        />
      </section>
    </NeonDashboardShell>
  );
}

function StatCard({
  icon,
  iconBg,
  iconColor,
  label,
  value,
  unit,
  valueColor,
  glow,
  foot,
}: {
  icon: React.ReactNode;
  iconBg: string;
  iconColor: string;
  label: string;
  value: string;
  unit: string;
  valueColor: string;
  glow: string;
  foot: string;
}) {
  return (
    <div
      className="rounded-[20px] border border-[#211B33] p-[22px] pb-5 flex flex-col gap-3.5"
      style={{ background: 'var(--neon-surface-card)' }}
    >
      <div className="flex items-center justify-between">
        <span className="text-sm font-bold" style={{ color: 'var(--neon-text-mid)' }}>{label}</span>
        <span className="h-10 w-10 rounded-xl flex items-center justify-center" style={{ background: iconBg, color: iconColor }}>
          {icon}
        </span>
      </div>
      <div className="flex items-baseline gap-2">
        <span className="font-neon-display font-extrabold text-[44px] leading-none tabular-nums" style={{ color: valueColor, textShadow: glow }}>
          {value}
        </span>
        <span className="text-[15px] font-bold" style={{ color: 'var(--neon-text-mid)' }}>{unit}</span>
      </div>
      <span className="text-[13px]" style={{ color: 'var(--neon-text-lo)' }}>{foot}</span>
    </div>
  );
}
