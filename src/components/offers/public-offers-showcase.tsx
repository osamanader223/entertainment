'use client';

import Link from 'next/link';
import { Lock } from 'lucide-react';
import { useT } from '@/i18n/context';
import type { PublicOfferCard as PublicOfferCardData } from '@/lib/offers';
import { compactBadgeText } from './offer-card';
import { discountSentence } from './discount-format';

interface PublicOffersShowcaseProps {
  offers: PublicOfferCardData[];
}

/**
 * Public-board version of OffersShowcase/OfferCard/LockedOfferCard — same
 * neon visual language, but no per-customer data (no redemption counts, no
 * "points away from" progress) and no "Use now" action, since there's no
 * signed-in customer to act on. Tier-gated offers still show as teasers.
 */
export function PublicOffersShowcase({ offers }: PublicOffersShowcaseProps) {
  const { t } = useT();
  const eligible = offers.filter((o) => !o.minTier);
  const locked = offers.filter((o) => o.minTier);

  if (offers.length === 0) return null;

  return (
    <div className="flex flex-col gap-6">
      <section>
        <div className="flex items-center justify-between mb-3.5">
          <span className="text-xl font-extrabold text-[color:var(--neon-text-hi)]">{t('customerOffers.offersForYou')}</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {eligible.map((offer) => (
            <PublicOfferCard key={offer.id} offer={offer} />
          ))}
        </div>
      </section>

      {locked.length > 0 && (
        <section>
          <div className="mb-3.5">
            <div className="text-xl font-extrabold text-[color:var(--neon-text-hi)]">{t('customerOffers.unlockMore')}</div>
            <p className="text-xs mt-0.5" style={{ color: 'var(--neon-text-mid)' }}>{t('customerOffers.unlockMoreHint')}</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {locked.map((offer) => (
              <PublicLockedOfferCard key={offer.id} offer={offer} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function PublicOfferCard({ offer }: { offer: PublicOfferCardData }) {
  const { t, locale } = useT();
  const description = locale === 'ar' ? offer.descriptionAr : offer.descriptionEn;
  const image = offer.imageUrl ?? undefined;

  return (
    <div
      className="rounded-[20px] border border-[#2A1E42] overflow-hidden flex flex-col"
      style={{ background: 'var(--neon-surface-offer)' }}
    >
      <div className="relative h-[118px] overflow-hidden">
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={image} alt="" className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          <div className="absolute inset-0" style={{ background: 'linear-gradient(160deg,#1E1730,#120E1E)' }} aria-hidden />
        )}
        <span
          className="absolute top-3 end-3 font-neon-display font-extrabold text-[15px] px-2.5 py-1 rounded-[10px]"
          style={{ background: 'var(--neon-cyan)', color: '#04121A', boxShadow: '0 0 18px rgba(47,243,243,.7)' }}
        >
          {compactBadgeText(offer.discountType, offer.discountValue)}
        </span>
        <span
          className="absolute inset-0 pointer-events-none"
          style={{ background: 'linear-gradient(to top, rgba(8,6,14,.92), rgba(8,6,14,.25) 55%, transparent)' }}
        />
      </div>

      <div className="p-[18px] pt-4 flex flex-col gap-3">
        <div>
          <div className="text-[17px] font-extrabold text-[color:var(--neon-text-hi)]">{offer.title}</div>
          {description && <div className="text-[13px] text-[#9089A8] leading-[1.5] mt-1">{description}</div>}
        </div>

        <div className="flex items-center justify-between gap-2.5">
          {offer.code ? (
            <span
              className="flex items-center gap-2 rounded-[10px] px-3 py-[7px] border border-dashed"
              style={{ borderColor: '#3A2F58', background: '#0E0A18' }}
            >
              <span className="text-[11px] font-bold text-[color:var(--neon-text-lo)]">{t('customerOffers.codeLabelShort')}</span>
              <span className="font-neon-display font-bold text-sm tracking-wider" style={{ color: 'var(--neon-magenta-soft)' }}>
                {offer.code}
              </span>
            </span>
          ) : (
            <span className="text-xs font-semibold" style={{ color: 'var(--neon-cyan)' }}>
              {t('customerOffers.appliesAutomatically')}
            </span>
          )}
          <Link
            href="/login"
            className="whitespace-nowrap rounded-xl px-4 py-2.5 text-[13px] font-extrabold text-white"
            style={{ background: 'linear-gradient(135deg,#FF2D9E,#7B2FF7)', boxShadow: '0 0 18px -6px rgba(255,45,158,.8)' }}
          >
            {t('customerOffers.signInToUse')}
          </Link>
        </div>
      </div>
    </div>
  );
}

function PublicLockedOfferCard({ offer }: { offer: PublicOfferCardData }) {
  const { t, locale } = useT();
  const description = locale === 'ar' ? offer.descriptionAr : offer.descriptionEn;
  const requiredTier = offer.minTier ?? 'silver';

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
          {t('customerOffers.tierAndAbove', { tier: t(`loyalty.tier.${requiredTier}`) })}
        </span>
      </div>

      <div className="p-[18px] pt-4 flex flex-col gap-2">
        <div>
          <div className="text-[17px] font-extrabold text-[color:var(--neon-text-hi)]">{offer.title}</div>
          {description && <div className="text-[13px] text-[#9089A8] leading-[1.5] mt-1">{description}</div>}
        </div>
        <div className="text-sm font-semibold text-[color:var(--neon-text-mid)]">
          {discountSentence(t, offer.discountType, offer.discountValue)}
        </div>
        <div className="text-xs text-[color:var(--neon-text-lo)]">{t('customerOffers.keepPlaying')}</div>
      </div>
    </div>
  );
}
