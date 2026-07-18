'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { useT } from '@/i18n/context';
import { formatMoney } from '@/lib/utils';
import type { CustomerOfferCard as CustomerOfferCardData } from '@/lib/offers';
import { Copy, Check } from 'lucide-react';

// Compact scoreboard-style badge text, matching the handoff mockup exactly
// (e.g. "-25%", "-40%", "2x") — distinct from the longer "25% OFF" sentence
// form used elsewhere in the app (discount-format.ts).
export function compactBadgeText(discountType: string, discountValue: number): string {
  switch (discountType) {
    case 'percent': return `-${discountValue}%`;
    case 'fixed': return `-${formatMoney(discountValue)}`;
    case 'free_minutes': return `+${discountValue}m`;
    case 'double_points': return '2x';
    default: return '';
  }
}

interface OfferCardProps {
  offer: CustomerOfferCardData;
  /** Overrides offer.imageUrl (e.g. future Ideogram-generated artwork). Falls back to a flat gradient placeholder — never a broken image. */
  illustration?: string;
}

export function OfferCard({ offer, illustration }: OfferCardProps) {
  const { t, locale } = useT();
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const image = illustration ?? offer.imageUrl ?? undefined;

  const name = locale === 'ar' ? offer.nameAr : offer.nameEn;
  const description = locale === 'ar' ? offer.descriptionAr : offer.descriptionEn;

  const handleCopy = async () => {
    if (!offer.code) return;
    try {
      await navigator.clipboard.writeText(offer.code);
      setCopied(true);
      toast.success(t('customerOffers.codeCopied'));
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error(t('customerOffers.copyFailed'));
    }
  };

  const handleUseNow = () => {
    if (offer.redemptionType === 'code' && offer.code) {
      router.push(`/dashboard/book?offer=${encodeURIComponent(offer.code)}`);
    } else {
      router.push('/dashboard/book');
    }
  };

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
          <div
            className="absolute inset-0"
            style={{ background: 'linear-gradient(160deg,#1E1730,#120E1E)' }}
            aria-hidden
          />
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
          <div className="text-[17px] font-extrabold text-[color:var(--neon-text-hi)]">{name}</div>
          {description && <div className="text-[13px] text-[#9089A8] leading-[1.5] mt-1">{description}</div>}
        </div>

        <div className="flex items-center justify-between gap-2.5">
          {offer.code ? (
            <button
              type="button"
              onClick={handleCopy}
              title={t('customerOffers.copyCode')}
              className="flex items-center gap-2 rounded-[10px] px-3 py-[7px] border border-dashed"
              style={{ borderColor: '#3A2F58', background: '#0E0A18' }}
            >
              <span className="text-[11px] font-bold text-[color:var(--neon-text-lo)]">{t('customerOffers.codeLabelShort')}</span>
              <span className="font-neon-display font-bold text-sm tracking-wider" style={{ color: 'var(--neon-magenta-soft)' }}>
                {offer.code}
              </span>
              {copied ? <Check className="h-3.5 w-3.5 text-[color:var(--neon-cyan)]" /> : <Copy className="h-3 w-3 text-[color:var(--neon-text-lo)]" />}
            </button>
          ) : (
            <span className="text-xs font-semibold" style={{ color: 'var(--neon-cyan)' }}>
              {t('customerOffers.appliesAutomatically')}
            </span>
          )}
          <button
            type="button"
            onClick={handleUseNow}
            className="whitespace-nowrap rounded-xl px-4 py-2.5 text-[13px] font-extrabold text-white"
            style={{ background: 'linear-gradient(135deg,#FF2D9E,#7B2FF7)', boxShadow: '0 0 18px -6px rgba(255,45,158,.8)' }}
          >
            {t('customerOffers.useNow')}
          </button>
        </div>
      </div>
    </div>
  );
}
