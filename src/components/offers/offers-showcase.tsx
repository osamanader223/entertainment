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
    <div className="flex flex-col gap-6">
      <section>
        <div className="flex items-center justify-between mb-3.5">
          <span className="text-xl font-extrabold text-[color:var(--neon-text-hi)]">{t('customerOffers.offersForYou')}</span>
          {eligible.length > 0 && (
            <a href="#" className="text-[13px] font-bold" style={{ color: 'var(--neon-cyan)' }}>
              {t('customerOffers.seeAll')}
            </a>
          )}
        </div>
        {eligible.length === 0 ? (
          <p className="text-sm py-6 text-center rounded-2xl border border-[#2A1E42]" style={{ color: 'var(--neon-text-mid)' }}>
            {t('customerOffers.noOffersNow')}
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {eligible.map((offer) => (
              <OfferCard key={offer.id} offer={offer} />
            ))}
          </div>
        )}
      </section>

      {locked.length > 0 && (
        <section>
          <div className="mb-3.5">
            <div className="text-xl font-extrabold text-[color:var(--neon-text-hi)]">{t('customerOffers.unlockMore')}</div>
            <p className="text-xs mt-0.5" style={{ color: 'var(--neon-text-mid)' }}>{t('customerOffers.unlockMoreHint')}</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {locked.map((offer) => (
              <LockedOfferCard key={offer.id} offer={offer} nextTier={nextTier} pointsToNextTier={pointsToNextTier} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
