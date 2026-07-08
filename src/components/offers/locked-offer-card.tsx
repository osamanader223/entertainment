'use client';

import { Card, CardContent } from '@/components/ui/card';
import { useT } from '@/i18n/context';
import { cn } from '@/lib/utils';
import type { LockedCustomerOfferCard } from '@/lib/offers';
import { discountSentence } from './discount-format';
import { Lock } from 'lucide-react';

const TIER_BADGE: Record<string, string> = {
  silver: 'bg-slate-400/15 text-slate-300 border-slate-400/30',
  gold: 'bg-gold-500/15 text-gold-400 border-gold-500/30',
  platinum: 'bg-cyan-400/15 text-cyan-300 border-cyan-400/30',
  diamond: 'bg-violet-400/15 text-violet-300 border-violet-400/30',
};

interface LockedOfferCardProps {
  offer: LockedCustomerOfferCard;
  nextTier?: string | null;
  pointsToNextTier?: number | null;
}

export function LockedOfferCard({ offer, nextTier, pointsToNextTier }: LockedOfferCardProps) {
  const { t, locale } = useT();

  const name = locale === 'ar' ? offer.nameAr : offer.nameEn;
  const description = locale === 'ar' ? offer.descriptionAr : offer.descriptionEn;
  const isNextTier = nextTier === offer.requiredTier && pointsToNextTier !== null && pointsToNextTier !== undefined;

  return (
    <Card className="glass grayscale opacity-60 hover:opacity-80 transition-opacity">
      <CardContent className="p-5 space-y-3">
        <span className={cn('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-bold', TIER_BADGE[offer.requiredTier] ?? TIER_BADGE.gold)}>
          <Lock className="h-3.5 w-3.5" />
          {t('customerOffers.unlockAt', { tier: t(`loyalty.tier.${offer.requiredTier}`) })}
        </span>

        <div>
          <h3 className="font-semibold text-base">{name}</h3>
          {description && <p className="text-sm text-muted-foreground mt-0.5">{description}</p>}
        </div>

        <p className="text-sm font-medium">{discountSentence(t, offer.discountType, offer.discountValue)}</p>

        {isNextTier ? (
          <p className="text-xs text-gold-400">
            {t('customerOffers.pointsAway', { points: String(pointsToNextTier), tier: t(`loyalty.tier.${offer.requiredTier}`) })}
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">{t('customerOffers.keepPlaying')}</p>
        )}
      </CardContent>
    </Card>
  );
}
