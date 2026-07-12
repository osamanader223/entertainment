'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StationPicker } from '@/components/cashier/station-picker';
import type { PublicVenueState, PublicStation } from '@/lib/venue';
import { cn, formatMoney, translateReason } from '@/lib/utils';
import { Loader2, Wallet, CheckCircle2, PartyPopper, Tag, X, CalendarClock, Zap, AlertTriangle } from 'lucide-react';
import {
  getBookingPriceAction,
  createBookingAction,
  previewOfferAction,
  getSchedulableGameTypesAction,
  getAvailableStationsAction,
  createScheduledBookingAction,
} from '@/app/(dashboard)/dashboard/book/actions';
import { useT } from '@/i18n/context';

interface BookingFlowProps {
  tenantId: string;
  branchId: string;
  branchCode: string;
  customerId: string;
  initialWalletBalanceCents: number;
  initial?: PublicVenueState;
  initialOfferCode?: string;
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
  pointsAwarded: number;
  tierUp: boolean;
  newTier: string;
}

interface ScheduledConfirmation {
  stationName: string;
  scheduledStartAt: string;
  scheduledEndAt: string;
  chargedCents: number;
  balanceCents: number;
  referenceCode: string;
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

interface SchedulableGameType {
  id: string;
  code: string;
  displayNameEn: string;
  displayNameAr: string;
  icon: string | null;
}

const DURATION_PRESETS = [30, 60, 90] as const;

export function BookingFlow({ branchCode, initialWalletBalanceCents, initial, initialOfferCode }: BookingFlowProps) {
  const { t, locale } = useT();
  const [mode, setMode] = useState<'now' | 'later'>('now');

  // ==================== "Book now" (instant) ====================
  const [selectedStation, setSelectedStation] = useState<PublicStation | null>(null);
  const [duration, setDuration] = useState<number | null>(null);
  const [showCustomDuration, setShowCustomDuration] = useState(false);
  const [customDuration, setCustomDuration] = useState('');

  const [price, setPrice] = useState<number | null>(null);
  const [pricePending, startPrice] = useTransition();

  const initialCode = initialOfferCode?.trim().toUpperCase() || '';
  const [promoInput, setPromoInput] = useState(initialCode);
  const [activeCode, setActiveCode] = useState<string | null>(initialCode || null);
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

  useEffect(() => {
    if (mode !== 'now' || !selectedStation || !effectiveDuration) {
      if (mode === 'now') { setPrice(null); setOfferPreview(null); }
      return;
    }
    startPrice(async () => {
      const res = await getBookingPriceAction({ stationId: selectedStation.id, durationMinutes: effectiveDuration });
      if (res.error) { setPrice(null); toast.error(res.error); return; }
      setPrice(res.amountCents ?? null);
    });
  }, [mode, selectedStation, effectiveDuration]);

  const selectedStationId = selectedStation?.id;
  useEffect(() => {
    if (mode !== 'now' || !price || !selectedStationId || !effectiveDuration) {
      if (mode === 'now') setOfferPreview(null);
      return;
    }
    startOffer(async () => {
      const res = await previewOfferAction({ stationId: selectedStationId, durationMinutes: effectiveDuration, code: activeCode ?? undefined });
      setOfferPreview(res as OfferPreview);
    });
  }, [mode, price, selectedStationId, effectiveDuration, activeCode]);

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
      if (!res.ok) { toast.error(res.error); return; }

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
        pointsAwarded: res.pointsAwarded,
        tierUp: res.tierUp,
        newTier: res.newTier,
      });
      toast.success(t('booking.bookingConfirmedToast'), { icon: <CheckCircle2 className="h-4 w-4" /> });
    });
  };

  const offerName = locale === 'ar'
    ? (offerPreview?.offerNameAr ?? offerPreview?.offerNameEn ?? '')
    : (offerPreview?.offerNameEn ?? '');

  // ==================== "Book for later" (scheduled) ====================
  const [gameTypes, setGameTypes] = useState<SchedulableGameType[]>([]);
  const [gameTypesLoaded, setGameTypesLoaded] = useState(false);
  const [selectedGameTypeId, setSelectedGameTypeId] = useState<string | null>(null);

  const [scheduledDate, setScheduledDate] = useState('');
  const [scheduledTime, setScheduledTime] = useState('');
  const [laterDuration, setLaterDuration] = useState<number | null>(null);
  const [laterShowCustomDuration, setLaterShowCustomDuration] = useState(false);
  const [laterCustomDuration, setLaterCustomDuration] = useState('');

  const [availableStations, setAvailableStations] = useState<Array<{ stationId: string; code: string; displayName: string }>>([]);
  const [availabilityChecked, setAvailabilityChecked] = useState(false);
  const [availabilityPending, startAvailability] = useTransition();
  const [selectedLaterStationId, setSelectedLaterStationId] = useState<string | null>(null);

  const [laterPrice, setLaterPrice] = useState<number | null>(null);
  const [laterPricePending, startLaterPrice] = useTransition();
  const [laterPromoInput, setLaterPromoInput] = useState('');
  const [laterActiveCode, setLaterActiveCode] = useState<string | null>(null);
  const [laterOfferPreview, setLaterOfferPreview] = useState<OfferPreview | null>(null);
  const [laterOfferPending, startLaterOffer] = useTransition();
  const [laterConfirmPending, startLaterConfirm] = useTransition();
  const [scheduledConfirmation, setScheduledConfirmation] = useState<ScheduledConfirmation | null>(null);

  const todayStr = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const laterEffectiveDuration = useMemo(() => {
    if (laterShowCustomDuration) {
      const n = Number.parseInt(laterCustomDuration, 10);
      return Number.isFinite(n) && n >= 5 && n <= 480 ? n : null;
    }
    return laterDuration;
  }, [laterShowCustomDuration, laterCustomDuration, laterDuration]);

  const scheduledStartDate = useMemo(() => {
    if (!scheduledDate || !scheduledTime) return null;
    const d = new Date(`${scheduledDate}T${scheduledTime}:00`);
    return Number.isNaN(d.getTime()) || d.getTime() <= Date.now() ? null : d;
  }, [scheduledDate, scheduledTime]);

  useEffect(() => {
    if (mode !== 'later' || gameTypesLoaded) return;
    (async () => {
      const res = await getSchedulableGameTypesAction();
      if (res.ok) setGameTypes(res.gameTypes);
      setGameTypesLoaded(true);
    })();
  }, [mode, gameTypesLoaded]);

  useEffect(() => {
    setAvailableStations([]);
    setSelectedLaterStationId(null);
    setAvailabilityChecked(false);
    if (!selectedGameTypeId || !scheduledStartDate || !laterEffectiveDuration) return;
    startAvailability(async () => {
      const res = await getAvailableStationsAction({
        gameTypeId: selectedGameTypeId,
        scheduledStartAt: scheduledStartDate.toISOString(),
        durationMinutes: laterEffectiveDuration,
      });
      setAvailabilityChecked(true);
      if (res.ok) {
        setAvailableStations(res.stations);
        if (res.stations.length > 0) setSelectedLaterStationId(res.stations[0].stationId);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedGameTypeId, scheduledStartDate, laterEffectiveDuration]);

  useEffect(() => {
    if (!selectedLaterStationId || !laterEffectiveDuration) {
      setLaterPrice(null);
      setLaterOfferPreview(null);
      return;
    }
    startLaterPrice(async () => {
      const res = await getBookingPriceAction({ stationId: selectedLaterStationId, durationMinutes: laterEffectiveDuration });
      if (res.error) { setLaterPrice(null); toast.error(res.error); return; }
      setLaterPrice(res.amountCents ?? null);
    });
  }, [selectedLaterStationId, laterEffectiveDuration]);

  useEffect(() => {
    if (!laterPrice || !selectedLaterStationId || !laterEffectiveDuration) {
      setLaterOfferPreview(null);
      return;
    }
    startLaterOffer(async () => {
      const res = await previewOfferAction({ stationId: selectedLaterStationId, durationMinutes: laterEffectiveDuration, code: laterActiveCode ?? undefined });
      setLaterOfferPreview(res as OfferPreview);
    });
  }, [laterPrice, selectedLaterStationId, laterEffectiveDuration, laterActiveCode]);

  const laterFinalPrice = laterOfferPreview?.applied ? laterOfferPreview.finalAmountCents : laterPrice;
  const laterInsufficientFunds = laterFinalPrice !== null && walletBalance < laterFinalPrice;
  const canConfirmLater =
    !!selectedLaterStationId && !!laterEffectiveDuration && !!scheduledStartDate &&
    laterPrice !== null && laterFinalPrice !== null && !laterInsufficientFunds && !laterConfirmPending;

  const laterOfferName = locale === 'ar'
    ? (laterOfferPreview?.offerNameAr ?? laterOfferPreview?.offerNameEn ?? '')
    : (laterOfferPreview?.offerNameEn ?? '');

  const handleConfirmLater = () => {
    if (!selectedLaterStationId || !laterEffectiveDuration || !scheduledStartDate) return;
    startLaterConfirm(async () => {
      const res = await createScheduledBookingAction({
        stationId: selectedLaterStationId,
        scheduledStartAt: scheduledStartDate.toISOString(),
        durationMinutes: laterEffectiveDuration,
        offerCode: laterActiveCode ?? undefined,
      });
      if (!res.ok) {
        toast.error(translateReason(t, 'scheduling', res.error));
        return;
      }
      setWalletBalance(res.balanceCents);
      setScheduledConfirmation({
        stationName: availableStations.find((s) => s.stationId === selectedLaterStationId)?.displayName ?? '',
        scheduledStartAt: res.scheduledStartAt,
        scheduledEndAt: res.scheduledEndAt,
        chargedCents: res.chargedCents,
        balanceCents: res.balanceCents,
        referenceCode: res.referenceCode,
      });
      toast.success(t('scheduling.reservationConfirmedToast'));
    });
  };

  const switchMode = (next: 'now' | 'later') => {
    setMode(next);
    setConfirmation(null);
    setScheduledConfirmation(null);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">{t('booking.title')}</h1>
        <p className="text-muted-foreground mt-1">{t('booking.subtitle')}</p>
      </div>

      {/* Mode toggle */}
      <div className="inline-flex rounded-lg border border-border/60 p-1 bg-card/40">
        <button
          type="button"
          onClick={() => switchMode('now')}
          className={cn('inline-flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium transition-colors', mode === 'now' ? 'bg-gold-500 text-black' : 'text-muted-foreground hover:text-foreground')}
        >
          <Zap className="h-4 w-4" />
          {t('scheduling.bookNow')}
        </button>
        <button
          type="button"
          onClick={() => switchMode('later')}
          className={cn('inline-flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium transition-colors', mode === 'later' ? 'bg-gold-500 text-black' : 'text-muted-foreground hover:text-foreground')}
        >
          <CalendarClock className="h-4 w-4" />
          {t('scheduling.bookLater')}
        </button>
      </div>

      {mode === 'now' ? (
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
                    onClick={() => { setDuration(min); setShowCustomDuration(false); }}
                  >
                    {min} {t('booking.min')}
                  </Button>
                ))}
                <Button type="button" variant={showCustomDuration ? 'gold' : 'outline'} size="xl" onClick={() => setShowCustomDuration(true)}>
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
                        <ConfirmationRow label={t('offers.basePrice')} value={formatMoney(confirmation.amountCents)} />
                        <ConfirmationRow label={t('offers.discount')} value={`−${formatMoney(confirmation.appliedOffer.discountCents)}`} green />
                      </>
                    )}
                    <ConfirmationRow label={t('booking.paid')} value={formatMoney(confirmation.chargedCents)} gold />
                    <ConfirmationRow label={t('booking.newBalance')} value={formatMoney(confirmation.balanceCents)} />
                    <ConfirmationRow label={t('booking.reference')} value={confirmation.referenceCode} mono />
                  </div>
                  {confirmation.pointsAwarded > 0 && (
                    <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 space-y-1">
                      <p className="text-sm text-emerald-400 font-semibold">
                        {t('loyalty.youEarnedPoints', { points: confirmation.pointsAwarded.toLocaleString() })} 🎉
                      </p>
                      {confirmation.tierUp && (
                        <p className="text-xs text-gold-400 font-medium">
                          {t('loyalty.youReachedTier', { tier: t(`loyalty.tier.${confirmation.newTier}`) })}
                        </p>
                      )}
                    </div>
                  )}
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
                  <div className="rounded-lg border border-border/60 p-4 flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Wallet className="h-4 w-4" />
                      {t('booking.walletBalance')}
                    </div>
                    <div className="font-mono text-lg">{formatMoney(walletBalance)}</div>
                  </div>

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
                          {offerPending && activeCode ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : t('offers.applyCode')}
                        </Button>
                      </div>
                    )}

                    {activeCode && offerPreview && !offerPreview.applied && offerPreview.reason && (
                      <div className="flex items-center gap-1.5 text-xs text-destructive">
                        <span>{t('offers.codeNotApplied')}: {t(`offers.${offerPreview.reason}`) || offerPreview.reason}</span>
                        <button type="button" onClick={handleRemoveCode} className="underline hover:no-underline">{t('offers.removeCode')}</button>
                      </div>
                    )}
                  </div>

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
                        {t('booking.insufficientCredit', { current: formatMoney(walletBalance), needed: formatMoney(finalPrice) })}
                      </p>
                      <Link href="/dashboard/wallet" className="text-xs text-gold-400 underline hover:text-gold-300">
                        {t('wallet.topUpNow')}
                      </Link>
                    </div>
                  )}

                  <Button variant="gold" size="xl" className="w-full" disabled={!canConfirm} onClick={handleConfirm}>
                    {confirmPending && <Loader2 className="h-4 w-4 animate-spin" />}
                    {finalPrice !== null ? t('booking.confirmBooking', { amount: formatMoney(finalPrice) }) : t('booking.confirmBookingNoPrice')}
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      ) : (
        <div className="space-y-6 max-w-2xl">
          {/* Step 1 — Game type */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">{t('scheduling.step1GameType')}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {gameTypes.map((gt) => (
                  <Button
                    key={gt.id}
                    type="button"
                    variant={selectedGameTypeId === gt.id ? 'gold' : 'outline'}
                    className="h-16 flex-col gap-1"
                    onClick={() => setSelectedGameTypeId(gt.id)}
                  >
                    <span className="text-xl" aria-hidden>{gt.icon ?? '🎮'}</span>
                    <span className="text-xs">{locale === 'ar' ? gt.displayNameAr : gt.displayNameEn}</span>
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Step 2 — Date, time, duration */}
          <Card className={cn(!selectedGameTypeId && 'opacity-50 pointer-events-none')}>
            <CardHeader>
              <CardTitle className="text-lg">{t('scheduling.step2DateTime')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground mb-1.5 block">{t('scheduling.date')}</label>
                  <Input type="date" min={todayStr} value={scheduledDate} onChange={(e) => setScheduledDate(e.target.value)} className="font-mono" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1.5 block">{t('scheduling.time')}</label>
                  <Input type="time" value={scheduledTime} onChange={(e) => setScheduledTime(e.target.value)} className="font-mono" />
                </div>
              </div>

              <div className="grid grid-cols-4 gap-2">
                {DURATION_PRESETS.map((min) => (
                  <Button
                    key={min}
                    type="button"
                    variant={!laterShowCustomDuration && laterDuration === min ? 'gold' : 'outline'}
                    onClick={() => { setLaterDuration(min); setLaterShowCustomDuration(false); }}
                  >
                    {min} {t('booking.min')}
                  </Button>
                ))}
                <Button type="button" variant={laterShowCustomDuration ? 'gold' : 'outline'} onClick={() => setLaterShowCustomDuration(true)}>
                  {t('booking.custom')}
                </Button>
              </div>
              {laterShowCustomDuration && (
                <Input
                  type="number"
                  min={5}
                  max={480}
                  value={laterCustomDuration}
                  onChange={(e) => setLaterCustomDuration(e.target.value)}
                  placeholder={t('booking.minuteRange')}
                  className="font-mono tabular-nums"
                />
              )}
              {scheduledDate && scheduledTime && !scheduledStartDate && (
                <p className="text-xs text-destructive">{t('scheduling.mustBeFuture')}</p>
              )}
            </CardContent>
          </Card>

          {/* Step 3 — Station + Payment */}
          <Card className={cn((!selectedGameTypeId || !scheduledStartDate || !laterEffectiveDuration) && !scheduledConfirmation && 'opacity-50 pointer-events-none')}>
            <CardHeader>
              <CardTitle className="text-lg">{t('scheduling.step3Station')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {scheduledConfirmation ? (
                <div className="space-y-4 text-center">
                  <PartyPopper className="h-10 w-10 mx-auto text-gold-400" />
                  <div className="text-lg font-semibold">{t('scheduling.reservationConfirmedToast')}</div>
                  <div className="rounded-lg border border-gold-500/20 bg-gold-500/10 p-4 space-y-2">
                    <ConfirmationRow label={t('scheduling.station')} value={scheduledConfirmation.stationName} />
                    <ConfirmationRow
                      label={t('scheduling.window')}
                      value={`${new Date(scheduledConfirmation.scheduledStartAt).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })} – ${new Date(scheduledConfirmation.scheduledEndAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`}
                    />
                    <ConfirmationRow label={t('booking.paid')} value={formatMoney(scheduledConfirmation.chargedCents)} gold />
                    <ConfirmationRow label={t('booking.newBalance')} value={formatMoney(scheduledConfirmation.balanceCents)} />
                    <ConfirmationRow label={t('booking.reference')} value={scheduledConfirmation.referenceCode} mono />
                  </div>
                  <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 flex items-start gap-2 text-start">
                    <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
                    <p className="text-xs text-amber-300">{t('scheduling.arriveWarning')}</p>
                  </div>
                  <Button asChild variant="gold" size="xl" className="w-full">
                    <Link href="/dashboard">{t('booking.done')}</Link>
                  </Button>
                </div>
              ) : (
                <>
                  {availabilityPending ? (
                    <div className="text-center text-sm text-muted-foreground">{t('scheduling.checkingAvailability')}</div>
                  ) : availabilityChecked && availableStations.length === 0 ? (
                    <p className="text-sm text-destructive text-center">{t('scheduling.slotUnavailable')}</p>
                  ) : availableStations.length > 0 ? (
                    <div className="space-y-2">
                      <label className="text-xs text-muted-foreground">{t('scheduling.chooseStation')}</label>
                      <div className="grid grid-cols-3 gap-2">
                        {availableStations.map((s) => (
                          <Button
                            key={s.stationId}
                            type="button"
                            size="sm"
                            variant={selectedLaterStationId === s.stationId ? 'gold' : 'outline'}
                            onClick={() => setSelectedLaterStationId(s.stationId)}
                          >
                            {s.displayName}
                          </Button>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {laterPricePending ? (
                    <div className="text-center text-sm text-muted-foreground">{t('booking.calculatingPrice')}</div>
                  ) : laterPrice !== null ? (
                    <div className="rounded-lg border border-gold-500/20 bg-gold-500/10 p-4 text-center">
                      <div className="text-xs text-muted-foreground">{t('booking.total')}</div>
                      <div className="text-3xl font-bold tabular-nums text-gold-400">{formatMoney(laterPrice)}</div>
                    </div>
                  ) : null}

                  {selectedLaterStationId && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Tag className="h-3.5 w-3.5" />
                        {t('offers.promoCode')}
                      </div>
                      {laterActiveCode && laterOfferPreview?.applied ? (
                        <div className="flex items-center justify-between rounded-lg bg-emerald-500/10 border border-emerald-500/30 px-3 py-2">
                          <span className="text-sm text-emerald-400">
                            {t('offers.offerApplied', { name: laterOfferName })}
                            {laterOfferPreview.discountCents > 0 && ` — ${t('offers.youSave', { amount: formatMoney(laterOfferPreview.discountCents) })}`}
                            {laterOfferPreview.freeMinutes > 0 && ` — ${t('offers.freeMinutesAdded', { minutes: String(laterOfferPreview.freeMinutes) })}`}
                          </span>
                          <button type="button" onClick={() => { setLaterActiveCode(null); setLaterPromoInput(''); }} className="text-muted-foreground hover:text-foreground p-1">
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex gap-2">
                          <Input
                            value={laterPromoInput}
                            onChange={(e) => setLaterPromoInput(e.target.value.toUpperCase())}
                            onKeyDown={(e) => e.key === 'Enter' && laterPromoInput.trim() && setLaterActiveCode(laterPromoInput.trim().toUpperCase())}
                            placeholder="PROMO CODE"
                            className="font-mono uppercase h-10 text-sm"
                            disabled={laterOfferPending || laterPricePending}
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-10 shrink-0"
                            disabled={!laterPromoInput.trim() || laterOfferPending || laterPricePending}
                            onClick={() => setLaterActiveCode(laterPromoInput.trim().toUpperCase())}
                          >
                            {laterOfferPending && laterActiveCode ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : t('offers.applyCode')}
                          </Button>
                        </div>
                      )}
                      {laterActiveCode && laterOfferPreview && !laterOfferPreview.applied && laterOfferPreview.reason && (
                        <p className="text-xs text-destructive">{t('offers.codeNotApplied')}: {t(`offers.${laterOfferPreview.reason}`) || laterOfferPreview.reason}</p>
                      )}
                    </div>
                  )}

                  <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
                    <p className="text-xs text-amber-300">{t('scheduling.arriveWarning')}</p>
                  </div>

                  {laterInsufficientFunds && laterFinalPrice !== null && (
                    <div className="space-y-1">
                      <p className="text-xs text-destructive">
                        {t('booking.insufficientCredit', { current: formatMoney(walletBalance), needed: formatMoney(laterFinalPrice) })}
                      </p>
                      <Link href="/dashboard/wallet" className="text-xs text-gold-400 underline hover:text-gold-300">
                        {t('wallet.topUpNow')}
                      </Link>
                    </div>
                  )}

                  <Button variant="gold" size="xl" className="w-full" disabled={!canConfirmLater} onClick={handleConfirmLater}>
                    {laterConfirmPending && <Loader2 className="h-4 w-4 animate-spin" />}
                    {laterFinalPrice !== null
                      ? t('scheduling.confirmReservation', { amount: formatMoney(laterFinalPrice) })
                      : t('scheduling.confirmReservationNoPrice')}
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      )}
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
      <span className={cn(mono && 'font-mono', gold && 'text-gold-400 font-semibold', green && 'text-emerald-400 font-semibold')}>
        {value}
      </span>
    </div>
  );
}
