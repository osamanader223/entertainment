'use client';

import { useT } from '@/i18n/context';
import type { LoyaltyTier } from '@/lib/loyalty';

interface NeonLoyaltyModuleProps {
  tier: LoyaltyTier;
  pointsBalance: number;
  nextTier: LoyaltyTier | null;
  pointsToNextTier: number | null;
  progressPct: number; // 0..1
}

const TIER_ORDER: LoyaltyTier[] = ['silver', 'gold', 'platinum', 'diamond'];
const TIER_DOT: Record<LoyaltyTier, string> = {
  silver: '#C7CEDE',
  gold: '#F5C451',
  platinum: '#9AD8E5',
  diamond: '#7FE9FF',
};

export function NeonLoyaltyModule({ tier, pointsBalance, nextTier, pointsToNextTier, progressPct }: NeonLoyaltyModuleProps) {
  const { t } = useT();
  const pct = Math.round(Math.max(0, Math.min(1, progressPct)) * 100);

  return (
    <div
      className="relative overflow-hidden rounded-[22px] border border-[#2C2148] p-6"
      style={{ background: 'var(--neon-surface-loyalty)' }}
    >
      <span
        className="absolute inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(300px 160px at 90% 0%, rgba(127,233,255,.12), transparent 70%)' }}
      />
      <div className="relative flex flex-wrap items-center justify-between gap-2.5 mb-5">
        <div>
          <div className="text-[13px] font-bold text-[color:var(--neon-text-mid)] mb-1.5">{t('dashboard.loyaltyTitle')}</div>
          <div className="flex items-baseline gap-2.5">
            <span className="text-2xl font-extrabold text-[color:var(--neon-text-hi)]">{t(`loyalty.tier.${tier}`)}</span>
            <span className="font-neon-display font-bold text-[color:var(--neon-cyan)] text-base tabular-nums">
              {pointsBalance.toLocaleString('en-US')}
            </span>
            <span className="text-[13px] text-[color:var(--neon-text-lo)]">{t('dashboard.pointsUnit')}</span>
          </div>
        </div>
        <div className="text-end text-[13px] font-bold text-[color:var(--neon-cyan-lt)] max-w-[220px]">
          {nextTier && pointsToNextTier !== null
            ? t('dashboard.pointsToNext', { points: pointsToNextTier.toLocaleString('en-US'), tier: t(`loyalty.tier.${nextTier}`) })
            : t('dashboard.topTierReached')}
        </div>
      </div>

      <div className="relative h-3 rounded-full bg-[#0C0818] border border-[#241C3A] overflow-hidden mb-[18px]">
        <div
          className="h-full rounded-full"
          style={{
            width: `${pct}%`,
            background: 'linear-gradient(90deg,#FF2D9E,#7B2FF7,#2FF3F3)',
            boxShadow: '0 0 16px rgba(127,233,255,.6)',
          }}
        />
      </div>

      <div className="relative flex gap-2.5 flex-wrap">
        {TIER_ORDER.map((tKey) => {
          const active = tKey === tier;
          return (
            <div
              key={tKey}
              className="flex items-center gap-2 px-3.5 py-2 rounded-full text-[13px] font-bold border"
              style={{
                borderColor: active ? '#3A6E78' : '#241C3A',
                background: active ? 'rgba(47,243,243,.10)' : '#0E0A18',
                color: active ? 'var(--neon-cyan-lt)' : 'var(--neon-text-lo)',
              }}
            >
              <span className="h-2 w-2 rounded-full" style={{ background: TIER_DOT[tKey], boxShadow: `0 0 8px ${TIER_DOT[tKey]}` }} />
              {t(`loyalty.tier.${tKey}`)}
            </div>
          );
        })}
      </div>
    </div>
  );
}
