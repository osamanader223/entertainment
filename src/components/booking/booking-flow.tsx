'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StationPicker } from '@/components/cashier/station-picker';
import type { PublicVenueState, PublicStation } from '@/lib/venue';
import { cn, formatMoney } from '@/lib/utils';
import { Loader2, Wallet, CheckCircle2, PartyPopper, Tag, X } from 'lucide-react';
import {
  getBookingPriceAction,
  createBookingAction,
  previewOfferAction,
} from '@/app/(dashboard)/dashboard/book/actions';
import { useT } from '@/i18n/context';

interface BookingFlowProps {
  tenantId: string;
  branchId: string;
  branchCode: string;
  customerId: string;
  initialWalletBalanceCents: number;
  initial?: PublicVenueState;
}

interface BookingConfirmation {
  stationName: string;
  durationMinutes: number;
  amountCents: number;
  chargedCents: number;
  balanceCents: number;
  referenceCode: string;
  appliedOffer?: {
    nameEn: string;
    nameAr: string;
    discountType: string;
    discountCents: number;
    freeMinutes: number;
    doublePoints: boolean;
  };
  offerNotAppliedReason?: string;
}

type OfferPreview = {
  applied: boolean;
  offerNameEn?: string;
  offerNameAr?: string;
  discountType?: string;
  discountCents: number;
  freeMinutes: number;
  doublePoints: boolean;
  finalAmountCents: number;
  reason?: string;
};

const DURATION_PRESETS = [30, 60, 90] as const;

export function BookingFlow({ branchCode, initialWalletBalanceCents, initial }: BookingFlowProps) {
  const { t, locale } = useT();
  const [selectedStation, setSelectedStation] = useState<PublicStation | null>(null);
  const [duration, setDuration] = useState<number | null>(null);
  const [showCustomDuration, setShowCustomDuration] = useState(false);
  const [customDuration, setCustomDuration] = useState('');

  const [price, setPrice] = useState<number | null>(null);
  const [pricePending, startPrice] = useTransition();

  // Offer state
  const [promoInput, setPromoInput] = useState('');
  const [activeCode, setActiveCode] = useState<string | null>(null);
  const [offerPreview, setOfferPreview] = useState<OfferPreview | null>(null);
  const [offerPending, startOffer] = useTransition();

  const [walletBalance, setWalletBalance] = useState(initialWalletBalanceCents);
  const [confirmPending, startConfirm] = useTransition();
  const [confirmation, setConfirmation] = useState<BookingConfirmation | null>(null);

  const effectiveDuration = useMemo(() => {
    if (showCustomDuration) {
      const n = Number.parseInt(customDuration, 10);
      return Number.isFinite(n) && n >= 5 && n <= 480 ? n : null;
    }
    return duration;
  }, [showCustomDuration, customDuration, duration]);

  // Fetch base price when station + duration are chosen
  useEffect(() => {
    if (!selectedStation || !effectiveDuration) {
      setPrice(null);
      setOfferPreview(null);
      return;
    }
    startPrice(async () => {
      const res = await getBookingPriceAction({
        stationId: selectedStation.id,
        durationMinutes: effectiveDuration,
      });
      if (res.error) {
        setPrice(null);
        toast.error(res.error);
        return;
      }
      setPrice(res.amountCents ?? null);
    });
  }, [selectedStation, effectiveDuration]);

  // Preview offer whenever price or active code changes
  const selectedStationId = selectedStation?.id;
  useEffect(() => {
    if (!price || !selectedStationId || !effectiveDuration) {
      setOfferPreview(null);
      return;
    }
    startOffer(async () => {
      const res = await previewOfferAction({
        stationId: selectedStationId,
        durationMinutes: effectiveDuration,
        code: activeCode ?? undefined,
      });
      setOfferPreview(res as OfferPreview);
    });
  }, [price, selectedStationId, effectiveDuration, activeCode]);

  const finalPrice = offerPreview?.applied ? offerPreview.finalAmountCents : price;
  const insufficientFunds = finalPrice !== null && walletBalance < finalPrice;
  const canConfirm =
    !!selectedStation && !!effectiveDuration && price !== null && finalPrice !== null &&
    !insufficientFunds && !confirmPending;
  const step3Ready = !!selectedStation && !!effectiveDuration && price !== null;

  const handleApplyCode = () => {
    if (!promoInput.trim()) return;
    setActiveCode(promoInput.trim().toUpperCase());
  };

  const handleRemoveCode = () => {
    setActiveCode(null);
    setPromoInput('');
  };

  const handleConfirm = () => {
    if (!selectedStation || !effectiveDuration || price === null) return;
    startConfirm(async () => {
      const res = await createBookingAction({
        stationId: selectedStation.id,
        durationMinutes: effectiveDuration,
        offerCode: activeCode ?? undefined,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }

      setWalletBalance(res.balanceCents);
      setConfirmation({
        stationName: selectedStation.display_name,
        durationMinutes: effectiveDuration + (res.appliedOffer?.freeMinutes ?? 0),
        amountCents: res.amountCents,
        chargedCents: res.chargedCents,
        balanceCents: res.balanceCents,
        referenceCode: res.referenceCode,
        appliedOffer: res.appliedOffer,
        offerNotAppliedReason: res.offerNotAppliedReason,
      });
      toast.success(t('booking.bookingConfirmedToast'), {
        icon: <CheckCircle2 className="h-4 w-4" />,
      });
    });
  };

  const offerName = locale === 'ar'
    ? (offerPreview?.offerNameAr ?? offerPreview?.offerNameEn ?? '')
    : (offerPreview?.offerNameEn ?? '');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">{t('booking.title')}</h1>
        <p className="text-muted-foreground mt-1">{t('booking.subtitle')}</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Step 1 — Station */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{t('booking.step1')}</CardTitle>
          </CardHeader>
          <CardContent>
            <StationPicker
              branchCode={branchCode}
              initial={initial}
              selectedStationId={selectedStation?.id ?? null}
              onSelect={(station) => {
                setSelectedStation(station);
                setConfirmation(null);
                setActiveCode(null);
                setPromoInput('');
              }}
            />
          </CardContent>
        </Card>

        {/* Step 2 — Duration */}
        <Card className={cn(!selectedStation && 'opacity-50 pointer-events-none')}>
          <CardHeader>
            <CardTitle className="text-lg">{t('booking.step2')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-4 gap-2">
              {DURATION_PRESETS.map((min) => (
                <Button
                  key={min}
                  type="button"
                  variant={!showCustomDuration && duration === min ? 'gold' : 'outline'}
                  size="xl"
                  onClick={() => {
                    setDuration(min);
                    setShowCustomDuration(false);
                  }}
                >
                  {min} {t('booking.min')}
                </Button>
              ))}
              <Button
                type="button"
                variant={showCustomDuration ? 'gold' : 'outline'}
                size="xl"
                onClick={() => setShowCustomDuration(true)}
              >
                {t('booking.custom')}
              </Button>
            </div>

            {showCustomDuration && (
              <Input
                type="number"
                min={5}
                max={480}
                value={customDuration}
                onChange={(e) => setCustomDuration(e.target.value)}
                placeholder={t('booking.minuteRange')}
                className="h-12 font-mono tabular-nums"
              />
            )}

            {pricePending ? (
              <div className="text-center text-sm text-muted-foreground">{t('booking.calculatingPrice')}</div>
            ) : price !== null ? (
              <div className="rounded-lg border border-gold-500/20 bg-gold-500/10 p-4 text-center">
                <div className="text-xs text-muted-foreground">{t('booking.total')}</div>
                <div className="text-3xl font-bold tabular-nums text-gold-400">{formatMoney(price)}</div>
              </div>
            ) : null}
          </CardContent>
        </Card>

        {/* Step 3 — Payment + Confirm */}
        <Card className={cn(!step3Ready && !confirmation && 'opacity-50 pointer-events-none')}>
          <CardHeader>
            <CardTitle className="text-lg">{t('booking.step3')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {confirmation ? (
              <div className="space-y-4 text-center">
                <PartyPopper className="h-10 w-10 mx-auto text-gold-400" />
                <div>
                  <div className="text-lg font-semibold">{t('booking.bookingConfirmed')}</div>
                  <div className="text-sm text-muted-foreground">
                    {confirmation.stationName} · {confirmation.durationMinutes} {t('booking.min')}
                  </div>
                  {confirmation.appliedOffer?.freeMinutes ? (
                    <div className="text-xs text-emerald-400 mt-0.5">
                      {t('offers.freeMinutesAdded', { minutes: String(confirmation.appliedOffer.freeMinutes) })}
                    </div>
                  ) : null}
                </div>
                <div className="rounded-lg border border-gold-500/20 bg-gold-500/10 p-4 space-y-2">
                  {confirmation.appliedOffer && confirmation.appliedOffer.discountCents > 0 && (
                    <>
                      <ConfirmationRow
                        label={t('offers.basePrice')}
                        value={formatMoney(confirmation.amountCents)}
                      />
                      <ConfirmationRow
                        label={t('offers.discount')}
                        value={`−${formatMoney(confirmation.appliedOffer.discountCents)}`}
                        green
                      />
                    </>
                  )}
                  <ConfirmationRow label={t('booking.paid')} value={formatMoney(confirmation.chargedCents)} gold />
                  <ConfirmationRow label={t('booking.newBalance')} value={formatMoney(confirmation.balanceCents)} />
                  <ConfirmationRow label={t('booking.reference')} value={confirmation.referenceCode} mono />
                </div>
                {confirmation.offerNotAppliedReason && (
                  <p className="text-xs text-muted-foreground">
                    {t('offers.codeNotApplied')}: {t(`offers.${confirmation.offerNotAppliedReason}`) || confirmation.offerNotAppliedReason}
                  </p>
                )}
                <Button asChild variant="gold" size="xl" className="w-full">
                  <Link href="/dashboard">{t('booking.done')}</Link>
                </Button>
              </div>
            ) : (
              <>
                {/* Wallet balance */}
                <div className="rounded-lg border border-border/60 p-4 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Wallet className="h-4 w-4" />
                    {t('booking.walletBalance')}
                  </div>
                  <div className="font-mono text-lg">{formatMoney(walletBalance)}</div>
                </div>

                {/* Auto-offer banner (when no code typed and an offer auto-applies) */}
                {!activeCode && offerPreview?.applied && !offerPending && (
                  <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 flex items-center gap-2">
                    <span className="text-base" aria-hidden>🎉</span>
                    <p className="text-sm text-emerald-400 font-medium">
                      {offerPreview.discountCents > 0
                        ? t('offers.autoOfferBanner', { name: offerName, amount: formatMoney(offerPreview.discountCents) })
                        : offerPreview.freeMinutes > 0
                          ? t('offers.autoOfferFreeMinutes', { name: offerName, minutes: String(offerPreview.freeMinutes) })
                          : t('offers.autoOfferDoublePoints', { name: offerName })}
                    </p>
                  </div>
                )}

                {/* Promo code section */}
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Tag className="h-3.5 w-3.5" />
                    {t('offers.promoCode')}
                  </div>

                  {activeCode && offerPreview?.applied ? (
                    <div className="flex items-center justify-between rounded-lg bg-emerald-500/10 border border-emerald-500/30 px-3 py-2">
                      <span className="text-sm text-emerald-400">
                        {t('offers.offerApplied', { name: offerName })}
                        {offerPreview.discountCents > 0 && ` — ${t('offers.youSave', { amount: formatMoney(offerPreview.discountCents) })}`}
                        {offerPreview.freeMinutes > 0 && ` — ${t('offers.freeMinutesAdded', { minutes: String(offerPreview.freeMinutes) })}`}
                        {offerPreview.doublePoints && ` — ${t('offers.doublePoints')}`}
                      </span>
                      <button type="button" onClick={handleRemoveCode} className="text-muted-foreground hover:text-foreground p-1">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <Input
                        value={promoInput}
                        onChange={(e) => setPromoInput(e.target.value.toUpperCase())}
                        onKeyDown={(e) => e.key === 'Enter' && handleApplyCode()}
                        placeholder="PROMO CODE"
                        className="font-mono uppercase h-10 text-sm"
                        disabled={offerPending || pricePending}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-10 shrink-0"
                        disabled={!promoInput.trim() || offerPending || pricePending}
                        onClick={handleApplyCode}
                      >
                        {offerPending && activeCode
                          ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          : t('offers.applyCode')}
                      </Button>
                    </div>
                  )}

                  {/* Code invalid feedback */}
                  {activeCode && offerPreview && !offerPreview.applied && offerPreview.reason && (
                    <div className="flex items-center gap-1.5 text-xs text-destructive">
                      <span>
                        {t('offers.codeNotApplied')}: {t(`offers.${offerPreview.reason}`) || offerPreview.reason}
                      </span>
                      <button type="button" onClick={handleRemoveCode} className="underline hover:no-underline">
                        {t('offers.removeCode')}
                      </button>
                    </div>
                  )}
                </div>

                {/* Price breakdown when discount applies */}
                {offerPreview?.applied && offerPreview.discountCents > 0 && price !== null && (
                  <div className="rounded-lg border border-border/60 p-3 space-y-1.5">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">{t('offers.basePrice')}</span>
                      <span className="font-mono">{formatMoney(price)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-emerald-400">{t('offers.discount')}</span>
                      <span className="font-mono text-emerald-400">−{formatMoney(offerPreview.discountCents)}</span>
                    </div>
                    <div className="flex justify-between text-sm font-semibold border-t border-border/40 pt-1.5">
                      <span>{t('offers.finalPrice')}</span>
                      <span className="font-mono text-gradient-gold">{formatMoney(offerPreview.finalAmountCents)}</span>
                    </div>
                  </div>
                )}

                {insufficientFunds && finalPrice !== null && (
                  <div className="space-y-1">
                    <p className="text-xs text-destructive">
                      {t('booking.insufficientCredit', {
                        current: formatMoney(walletBalance),
                        needed: formatMoney(finalPrice),
                      })}
                    </p>
                    <Link
                      href="/dashboard/wallet"
                      className="text-xs text-gold-400 underline hover:text-gold-300"
                    >
                      {t('wallet.topUpNow')}
                    </Link>
                  </div>
                )}

                <Button
                  variant="gold"
                  size="xl"
                  className="w-full"
                  disabled={!canConfirm}
                  onClick={handleConfirm}
                >
                  {confirmPending && <Loader2 className="h-4 w-4 animate-spin" />}
                  {finalPrice !== null
                    ? t('booking.confirmBooking', { amount: formatMoney(finalPrice) })
                    : t('booking.confirmBookingNoPrice')}
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function ConfirmationRow({
  label,
  value,
  gold,
  green,
  mono,
}: {
  label: string;
  value: string;
  gold?: boolean;
  green?: boolean;
  mono?: boolean;
}) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span
        className={cn(
          mono && 'font-mono',
          gold && 'text-gold-400 font-semibold',
          green && 'text-emerald-400 font-semibold',
        )}
      >
        {value}
      </span>
    </div>
  );
}
