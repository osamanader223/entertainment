'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useT } from '@/i18n/context';
import { cn, formatMoney } from '@/lib/utils';
import type { CustomerOfferCard as CustomerOfferCardData } from '@/lib/offers';
import { discountBadgeText } from './discount-format';
import { Copy, Check, ArrowRight, Percent, DollarSign, Clock, Sparkles } from 'lucide-react';

const TYPE_STYLES: Record<string, { border: string; badge: string; icon: typeof Percent }> = {
  percent: { border: 'border-s-4 border-s-emerald-500/60', badge: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30', icon: Percent },
  fixed: { border: 'border-s-4 border-s-blue-500/60', badge: 'bg-blue-500/15 text-blue-400 border-blue-500/30', icon: DollarSign },
  free_minutes: { border: 'border-s-4 border-s-violet-500/60', badge: 'bg-violet-500/15 text-violet-400 border-violet-500/30', icon: Clock },
  double_points: { border: 'border-s-4 border-s-gold-500/60', badge: 'bg-gold-500/15 text-gold-400 border-gold-500/30', icon: Sparkles },
};

export function OfferCard({ offer }: { offer: CustomerOfferCardData }) {
  const { t, locale } = useT();
  const router = useRouter();
  const [copied, setCopied] = useState(false);

  const style = TYPE_STYLES[offer.discountType] ?? TYPE_STYLES.percent;
  const Icon = style.icon;

  const name = locale === 'ar' ? offer.nameAr : offer.nameEn;
  const description = locale === 'ar' ? offer.descriptionAr : offer.descriptionEn;
  const gameTypeName = locale === 'ar' ? offer.appliesToGameTypeNameAr : offer.appliesToGameTypeName;

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
    <Card className={cn('glass', style.border)}>
      <CardContent className="p-5 space-y-3">
        <span className={cn('inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-bold', style.badge)}>
          <Icon className="h-3.5 w-3.5" />
          {discountBadgeText(t, offer.discountType, offer.discountValue)}
        </span>

        <div>
          <h3 className="font-semibold text-base">{name}</h3>
          {description && <p className="text-sm text-muted-foreground mt-0.5">{description}</p>}
        </div>

        <div className="text-xs text-muted-foreground space-y-1">
          <div>{gameTypeName ?? t('customerOffers.allGames')}</div>
          {offer.minAmountCents !== null && (
            <div>{t('customerOffers.minSpend', { amount: formatMoney(offer.minAmountCents) })}</div>
          )}
          {offer.validTo && (
            <div>{t('customerOffers.expiresOn', { date: new Date(offer.validTo).toLocaleDateString('en-US') })}</div>
          )}
          {offer.remainingUsesForCustomer !== null && (
            <div>{t('customerOffers.usesLeft', { n: String(offer.remainingUsesForCustomer) })}</div>
          )}
        </div>

        {offer.redemptionType === 'auto' && (
          <p className="text-xs text-emerald-400">{t('customerOffers.appliesAutomatically')}</p>
        )}

        <div className="flex gap-2 pt-1">
          {offer.redemptionType === 'code' && offer.code && (
            <Button
              variant="outline"
              size="sm"
              className="flex-1 font-mono"
              title={t('customerOffers.copyCode')}
              onClick={handleCopy}
            >
              {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
              {offer.code}
            </Button>
          )}
          <Button variant="gold" size="sm" className="flex-1" onClick={handleUseNow}>
            {t('customerOffers.useNow')}
            <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
