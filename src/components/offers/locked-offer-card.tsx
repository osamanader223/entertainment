'use client';

import { useT } from '@/i18n/context';
import type { LockedCustomerOfferCard } from '@/lib/offers';
import { discountSentence } from './discount-format';
import { Lock } from 'lucide-react';

interface LockedOfferCardProps {
  offer: LockedCustomerOfferCard;
  nextTier?: string | null;
  pointsToNextTier?: number | null;
}

// The handoff mockup only specifies the unlocked offer card — this locked
// variant (a real feature: offers gated behind a loyalty tier) follows the
// same neon surface/radius/border language, dimmed, with a lock badge
// instead of the discount badge and no code/use-now controls.
export function LockedOfferCard({ offer, nextTier, pointsToNextTier }: LockedOfferCardProps) {
  const { t, locale } = useT();

  const name = locale === 'ar' ? offer.nameAr : offer.nameEn;
  const description = locale === 'ar' ? offer.descriptionAr : offer.descriptionEn;
  const isNextTier = nextTier === offer.requiredTier && pointsToNextTier !== null && pointsToNextTier !== undefined;

  return (
    <div
      className="rounded-[20px] border border-[#2A1E42] overflow-hidden flex flex-col opacity-70"
      style={{ background: 'var(--neon-surface-offer)' }}
    >
      <div className="relative h-[118px] overflow-hidden flex items-center justify-center" style={{ background: 'linear-gradient(160deg,#1a1626,#0d0917)' }}>
        <Lock className="h-8 w-8" style={{ color: 'var(--neon-text-lo)' }} />
        <span
          className="absolute top-3 end-3 font-neon-display font-extrabold text-xs px-2.5 py-1 rounded-[10px] bg-black/50 border border-[#3A2F58]"
          style={{ color: 'var(--neon-text-mid)' }}
        >
          {t('customerOffers.unlockAt', { tier: t(`loyalty.tier.${offer.requiredTier}`) })}
        </span>
      </div>

      <div className="p-[18px] pt-4 flex flex-col gap-2">
        <div>
          <div className="text-[17px] font-extrabold text-[color:var(--neon-text-hi)]">{name}</div>
          {description && <div className="text-[13px] text-[#9089A8] leading-[1.5] mt-1">{description}</div>}
        </div>
        <div className="text-sm font-semibold text-[color:var(--neon-text-mid)]">
          {discountSentence(t, offer.discountType, offer.discountValue)}
        </div>
        {isNextTier ? (
          <div className="text-xs font-bold" style={{ color: 'var(--neon-gold)' }}>
            {t('customerOffers.pointsAway', { points: String(pointsToNextTier), tier: t(`loyalty.tier.${offer.requiredTier}`) })}
          </div>
        ) : (
          <div className="text-xs text-[color:var(--neon-text-lo)]">{t('customerOffers.keepPlaying')}</div>
        )}
      </div>
    </div>
  );
}
