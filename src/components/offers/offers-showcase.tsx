'use client';

import { useT } from '@/i18n/context';
import type { CustomerOfferCard as CustomerOfferCardData, LockedCustomerOfferCard } from '@/lib/offers';
import { OfferCard } from './offer-card';
import { LockedOfferCard } from './locked-offer-card';

interface OffersShowcaseProps {
  eligible: CustomerOfferCardData[];
  locked: LockedCustomerOfferCard[];
  nextTier?: string | null;
  pointsToNextTier?: number | null;
}

export function OffersShowcase({ eligible, locked, nextTier, pointsToNextTier }: OffersShowcaseProps) {
  const { t } = useT();

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <h2 className="text-xl font-semibold">{t('customerOffers.offersForYou')}</h2>
        {eligible.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center rounded-lg border border-border/40 bg-card/20">
            {t('customerOffers.noOffersNow')}
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {eligible.map((offer) => (
              <OfferCard key={offer.id} offer={offer} />
            ))}
          </div>
        )}
      </section>

      {locked.length > 0 && (
        <section className="space-y-3">
          <div>
            <h2 className="text-xl font-semibold">{t('customerOffers.unlockMore')}</h2>
            <p className="text-xs text-muted-foreground mt-0.5">{t('customerOffers.unlockMoreHint')}</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {locked.map((offer) => (
              <LockedOfferCard key={offer.id} offer={offer} nextTier={nextTier} pointsToNextTier={pointsToNextTier} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
