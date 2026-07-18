'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { PublicVenueState } from '@/lib/venue';
import { cn, formatMoney, translateReason } from '@/lib/utils';
import { addDaysToDateString } from '@/lib/slots';
import {
  Loader2, Wallet, CheckCircle2, PartyPopper, Tag, X, AlertTriangle, ChevronLeft, ChevronRight,
} from 'lucide-react';
import {
  getBookingPriceAction,
  previewOfferAction,
  getSchedulableGameTypesAction,
  getBookingContextAction,
  getGameTypeSlotsAction,
  createScheduledBookingAction,
  computeBowlingDurationAction,
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
  /** Deep-link from a station/category card ("Book now") — pre-selects Step 1. */
  initialGameTypeId?: string;
  /** Deep-link from a specific station card — narrows Step 4's grid to just that station. */
  initialStationId?: string;
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

interface SlotRow {
  slotStart: string;
  label: string;
  isAfterMidnight: boolean;
  available: boolean;
  reason?: 'past' | 'booked' | 'exceeds_closing';
}

interface StationSlotRow {
  stationId: string;
  stationCode: string;
  stationName: string;
  slots: SlotRow[];
}

const DURATIONS = [30, 60, 90, 120, 180] as const;
const DURATION_LABEL_KEY: Record<number, string> = {
  30: 'slots.duration30',
  60: 'slots.duration60',
  90: 'slots.duration90',
  120: 'slots.duration120',
  180: 'slots.duration180',
};
const DATE_STRIP_DAYS = 14;
const DEFAULT_TIMEZONE = 'Asia/Riyadh';

function localeTag(locale: string): string {
  return locale === 'ar' ? 'ar-SA-u-nu-latn' : 'en-US';
}

function formatSlotTime(iso: string, locale: string, timezone: string): string {
  return new Intl.DateTimeFormat(localeTag(locale), { timeZone: timezone, hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date(iso));
}

function formatFullDateTime(iso: string, locale: string, timezone: string): string {
  return new Intl.DateTimeFormat(localeTag(locale), {
    timeZone: timezone, weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true,
  }).format(new Date(iso));
}

// venueDate is a plain 'YYYY-MM-DD' calendar label — format it at noon UTC so
// no timezone conversion can shift the displayed calendar day.
function dateLabelInstant(venueDate: string): Date {
  return new Date(`${venueDate}T12:00:00Z`);
}

function formatDateWeekday(venueDate: string, locale: string): string {
  return new Intl.DateTimeFormat(localeTag(locale), { timeZone: 'UTC', weekday: 'short' }).format(dateLabelInstant(venueDate));
}

function formatDateDayMonth(venueDate: string, locale: string): string {
  return new Intl.DateTimeFormat(localeTag(locale), { timeZone: 'UTC', day: 'numeric', month: 'short' }).format(dateLabelInstant(venueDate));
}

export function BookingFlow({
  branchCode: _branchCode,
  initialWalletBalanceCents,
  initialOfferCode,
  initialGameTypeId,
  initialStationId,
}: BookingFlowProps) {
  const { t, locale, dir } = useT();

  // ==================== Step 1 — game type ====================
  const [gameTypes, setGameTypes] = useState<SchedulableGameType[]>([]);
  const [gameTypesLoaded, setGameTypesLoaded] = useState(false);
  const [selectedGameTypeId, setSelectedGameTypeId] = useState<string | null>(initialGameTypeId ?? null);
  // Deep-linked from a specific station card — narrows the Step 4 grid to just
  // this one station until the customer picks a different game/date/duration.
  const [preselectStationId, setPreselectStationId] = useState<string | null>(initialStationId ?? null);

  // ==================== Step 2 — duration (or players/games for bowling) ====================
  const [duration, setDuration] = useState<number | null>(null);
  const [playerCount, setPlayerCount] = useState(2);
  const [gameCount, setGameCount] = useState<1 | 2>(1);
  const [bowlingDurationPending, startBowlingDuration] = useTransition();

  // ==================== Venue hours (loaded once) ====================
  const [bookingContext, setBookingContext] = useState<{ opensAt: string; closesAt: string; timezone: string; todayVenueDate: string } | null>(null);
  const timezone = bookingContext?.timezone ?? DEFAULT_TIMEZONE;

  // ==================== Step 3 — date strip ====================
  const [selectedVenueDate, setSelectedVenueDate] = useState<string | null>(null);
  const stripRef = useRef<HTMLDivElement>(null);

  // ==================== Step 4 — slot grid ====================
  const [stationSlots, setStationSlots] = useState<StationSlotRow[]>([]);
  const [slotsLoaded, setSlotsLoaded] = useState(false);
  const [slotsPending, startSlots] = useTransition();
  const [selectedStationId, setSelectedStationId] = useState<string | null>(null);
  const [selectedSlotStart, setSelectedSlotStart] = useState<string | null>(null);

  // ==================== Step 5 — confirm ====================
  const [price, setPrice] = useState<number | null>(null);
  const [pricePending, startPrice] = useTransition();
  const initialCode = initialOfferCode?.trim().toUpperCase() || '';
  const [promoInput, setPromoInput] = useState(initialCode);
  const [activeCode, setActiveCode] = useState<string | null>(initialCode || null);
  const [offerPreview, setOfferPreview] = useState<OfferPreview | null>(null);
  const [offerPending, startOffer] = useTransition();
  const [walletBalance, setWalletBalance] = useState(initialWalletBalanceCents);
  const [confirmPending, startConfirm] = useTransition();
  const [confirmation, setConfirmation] = useState<ScheduledConfirmation | null>(null);

  useEffect(() => {
    if (gameTypesLoaded) return;
    (async () => {
      const res = await getSchedulableGameTypesAction();
      if (res.ok) setGameTypes(res.gameTypes);
      setGameTypesLoaded(true);
    })();
  }, [gameTypesLoaded]);

  useEffect(() => {
    (async () => {
      const res = await getBookingContextAction();
      if (res.ok) {
        setBookingContext({ opensAt: res.opensAt, closesAt: res.closesAt, timezone: res.timezone, todayVenueDate: res.todayVenueDate });
        setSelectedVenueDate(res.todayVenueDate);
      }
    })();
  }, []);

  const dateOptions = useMemo(() => {
    if (!bookingContext) return [];
    return Array.from({ length: DATE_STRIP_DAYS }, (_, i) => addDaysToDateString(bookingContext.todayVenueDate, i));
  }, [bookingContext]);

  // Bowling isn't time-based — players + single/double game drive the
  // duration formula instead of a duration button click.
  const selectedGameType = useMemo(
    () => gameTypes.find((gt) => gt.id === selectedGameTypeId) ?? null,
    [gameTypes, selectedGameTypeId],
  );
  const isBowling = !!selectedGameType?.code?.toLowerCase().includes('bowl');

  useEffect(() => {
    if (!isBowling || !selectedGameTypeId) return;
    startBowlingDuration(async () => {
      const res = await computeBowlingDurationAction({ gameTypeId: selectedGameTypeId, playerCount, gameCount });
      if (res.ok) setDuration(res.durationMinutes);
      else toast.error(res.error);
    });
  }, [isBowling, selectedGameTypeId, playerCount, gameCount]);

  // Fetch the slot grid whenever game type / date / duration changes.
  useEffect(() => {
    setStationSlots([]);
    setSlotsLoaded(false);
    setSelectedStationId(null);
    setSelectedSlotStart(null);
    if (!selectedGameTypeId || !selectedVenueDate || !duration) return;
    startSlots(async () => {
      const res = await getGameTypeSlotsAction({ gameTypeId: selectedGameTypeId, venueDate: selectedVenueDate, durationMinutes: duration });
      setSlotsLoaded(true);
      if (res.ok) setStationSlots(res.stations);
      else toast.error(res.error);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedGameTypeId, selectedVenueDate, duration]);

  // Price + offer preview once a specific station is selected (same for every slot on that station).
  useEffect(() => {
    if (!selectedStationId || !duration) {
      setPrice(null);
      setOfferPreview(null);
      return;
    }
    startPrice(async () => {
      const res = await getBookingPriceAction({
        stationId: selectedStationId,
        durationMinutes: duration,
        playerCount: isBowling ? playerCount : undefined,
        gameCount: isBowling ? gameCount : undefined,
      });
      if (res.error) { setPrice(null); toast.error(res.error); return; }
      setPrice(res.amountCents ?? null);
    });
  }, [selectedStationId, duration, isBowling, playerCount, gameCount]);

  useEffect(() => {
    if (!price || !selectedStationId || !duration) {
      setOfferPreview(null);
      return;
    }
    startOffer(async () => {
      const res = await previewOfferAction({
        stationId: selectedStationId,
        durationMinutes: duration,
        code: activeCode ?? undefined,
        playerCount: isBowling ? playerCount : undefined,
        gameCount: isBowling ? gameCount : undefined,
      });
      setOfferPreview(res as OfferPreview);
    });
  }, [price, selectedStationId, duration, activeCode, isBowling, playerCount, gameCount]);

  const finalPrice = offerPreview?.applied ? offerPreview.finalAmountCents : price;
  const insufficientFunds = finalPrice !== null && walletBalance < finalPrice;
  const canConfirm =
    !!selectedStationId && !!selectedSlotStart && !!duration &&
    price !== null && finalPrice !== null && !insufficientFunds && !confirmPending;

  const offerName = locale === 'ar' ? (offerPreview?.offerNameAr ?? offerPreview?.offerNameEn ?? '') : (offerPreview?.offerNameEn ?? '');

  const selectedSlotEndISO = useMemo(() => {
    if (!selectedSlotStart || !duration) return null;
    return new Date(new Date(selectedSlotStart).getTime() + duration * 60_000).toISOString();
  }, [selectedSlotStart, duration]);

  const selectedStationName = stationSlots.find((s) => s.stationId === selectedStationId)?.stationName ?? '';

  const visibleStationSlots = useMemo(() => {
    if (!preselectStationId) return stationSlots;
    const only = stationSlots.filter((s) => s.stationId === preselectStationId);
    return only.length > 0 ? only : stationSlots;
  }, [stationSlots, preselectStationId]);

  const handleSelectGameType = (id: string) => {
    setSelectedGameTypeId(id);
    if (id !== initialGameTypeId) setPreselectStationId(null);
    setDuration(null);
    setConfirmation(null);
  };
  const handleSelectDuration = (min: number) => {
    setDuration(min);
    setConfirmation(null);
  };
  const handleSelectDate = (d: string) => {
    setSelectedVenueDate(d);
    setConfirmation(null);
  };
  const handleSelectSlot = (stationId: string, slotStart: string) => {
    setSelectedStationId(stationId);
    setSelectedSlotStart(slotStart);
    setConfirmation(null);
  };

  const handleApplyCode = () => {
    if (!promoInput.trim()) return;
    setActiveCode(promoInput.trim().toUpperCase());
  };
  const handleRemoveCode = () => {
    setActiveCode(null);
    setPromoInput('');
  };

  const handleConfirm = () => {
    if (!selectedStationId || !selectedSlotStart || !duration || price === null) return;
    startConfirm(async () => {
      const res = await createScheduledBookingAction({
        stationId: selectedStationId,
        scheduledStartAt: selectedSlotStart,
        durationMinutes: duration,
        offerCode: activeCode ?? undefined,
        playerCount: isBowling ? playerCount : undefined,
        gameCount: isBowling ? gameCount : undefined,
      });
      if (!res.ok) {
        toast.error(translateReason(t, 'scheduling', res.error));
        return;
      }
      setWalletBalance(res.balanceCents);
      setConfirmation({
        stationName: selectedStationName,
        scheduledStartAt: res.scheduledStartAt,
        scheduledEndAt: res.scheduledEndAt,
        chargedCents: res.chargedCents,
        balanceCents: res.balanceCents,
        referenceCode: res.referenceCode,
      });
      toast.success(t('scheduling.reservationConfirmedToast'), { icon: <CheckCircle2 className="h-4 w-4" /> });
    });
  };

  const scrollStrip = (direction: 1 | -1) => {
    const el = stripRef.current;
    if (!el) return;
    const amount = 168;
    el.scrollBy({ left: (dir === 'rtl' ? -1 : 1) * direction * amount, behavior: 'smooth' });
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-3xl font-bold">{t('booking.title')}</h1>
        <p className="text-muted-foreground mt-1">{t('booking.subtitle')}</p>
      </div>

      {/* Step 1 — Game type */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t('slots.step1')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {gameTypes.map((gt) => (
              <Button
                key={gt.id}
                type="button"
                variant={selectedGameTypeId === gt.id ? 'gold' : 'outline'}
                className="h-16 flex-col gap-1"
                onClick={() => handleSelectGameType(gt.id)}
              >
                <span className="text-xl" aria-hidden>{gt.icon ?? '🎮'}</span>
                <span className="text-xs">{locale === 'ar' ? gt.displayNameAr : gt.displayNameEn}</span>
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Step 2 — Duration */}
      <Card className={cn(!selectedGameTypeId && 'opacity-50 pointer-events-none')}>
        <CardHeader>
          <CardTitle className="text-lg">{t('slots.step2')}</CardTitle>
        </CardHeader>
        <CardContent>
          {isBowling ? (
            <div className="space-y-5">
              <div>
                <div className="text-sm font-medium mb-2">{t('slots.howManyPlayers')}</div>
                <div className="flex items-center gap-4">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    disabled={playerCount <= 1}
                    onClick={() => setPlayerCount((p) => Math.max(1, p - 1))}
                  >
                    −
                  </Button>
                  <span className="text-2xl font-bold tabular-nums w-8 text-center">{playerCount}</span>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    disabled={playerCount >= 8}
                    onClick={() => setPlayerCount((p) => Math.min(8, p + 1))}
                  >
                    +
                  </Button>
                </div>
              </div>
              <div>
                <div className="text-sm font-medium mb-2">{t('slots.singleOrDoubleGame')}</div>
                <div className="grid grid-cols-2 gap-2">
                  <Button type="button" variant={gameCount === 1 ? 'gold' : 'outline'} size="xl" onClick={() => setGameCount(1)}>
                    {t('slots.singleGame')}
                  </Button>
                  <Button type="button" variant={gameCount === 2 ? 'gold' : 'outline'} size="xl" onClick={() => setGameCount(2)}>
                    {t('slots.doubleGame')}
                  </Button>
                </div>
              </div>
              {bowlingDurationPending ? (
                <div className="text-xs text-muted-foreground">{t('slots.loadingSlots')}</div>
              ) : duration !== null ? (
                <div className="text-xs text-muted-foreground">{t('slots.estimatedDuration', { minutes: String(duration) })}</div>
              ) : null}
            </div>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
              {DURATIONS.map((min) => (
                <Button
                  key={min}
                  type="button"
                  variant={duration === min ? 'gold' : 'outline'}
                  size="xl"
                  onClick={() => handleSelectDuration(min)}
                >
                  {t(DURATION_LABEL_KEY[min])}
                </Button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Step 3 — Date strip */}
      <Card className={cn((!selectedGameTypeId || !duration) && 'opacity-50 pointer-events-none')}>
        <CardHeader>
          <CardTitle className="text-lg">{t('slots.step3')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" size="icon" className="hidden sm:inline-flex shrink-0" onClick={() => scrollStrip(-1)}>
              <ChevronLeft className="h-4 w-4 rtl:rotate-180" />
            </Button>
            <div
              ref={stripRef}
              className="flex gap-2 overflow-x-auto scroll-smooth snap-x snap-mandatory pb-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
            >
              {dateOptions.map((d, i) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => handleSelectDate(d)}
                  className={cn(
                    'shrink-0 snap-start flex flex-col items-center justify-center rounded-lg border px-4 py-2.5 min-w-[76px] transition-colors',
                    selectedVenueDate === d
                      ? 'bg-gold-500 text-black border-gold-500'
                      : 'border-border/60 hover:border-gold-500/40 text-muted-foreground hover:text-foreground',
                  )}
                >
                  <span className="text-[11px] font-medium">{i === 0 ? t('slots.today') : formatDateWeekday(d, locale)}</span>
                  <span className="text-sm font-bold tabular-nums">{formatDateDayMonth(d, locale)}</span>
                </button>
              ))}
            </div>
            <Button type="button" variant="outline" size="icon" className="hidden sm:inline-flex shrink-0" onClick={() => scrollStrip(1)}>
              <ChevronRight className="h-4 w-4 rtl:rotate-180" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Step 4 — Slot grid, grouped by station */}
      <Card className={cn((!selectedGameTypeId || !selectedVenueDate || !duration) && 'opacity-50 pointer-events-none')}>
        <CardHeader>
          <CardTitle className="text-lg">{t('slots.step4')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {slotsPending ? (
            <div className="text-center text-sm text-muted-foreground py-6">{t('slots.loadingSlots')}</div>
          ) : slotsLoaded && stationSlots.length === 0 ? (
            <p className="text-sm text-destructive text-center py-6">{t('slots.noStationsForGame')}</p>
          ) : slotsLoaded && visibleStationSlots.every((s) => s.slots.length === 0) ? (
            <p className="text-sm text-destructive text-center py-6">{t('slots.noSlotsAvailable')}</p>
          ) : (
            visibleStationSlots.map((station) => (
              <div key={station.stationId}>
                <div className="text-sm font-semibold mb-2">{station.stationName}</div>
                <div className="flex flex-wrap gap-2">
                  {station.slots.map((slot) => {
                    const isSelected = selectedStationId === station.stationId && selectedSlotStart === slot.slotStart;
                    return (
                      <button
                        key={slot.slotStart}
                        type="button"
                        disabled={!slot.available}
                        onClick={() => handleSelectSlot(station.stationId, slot.slotStart)}
                        className={cn(
                          'flex flex-col items-center justify-center rounded-lg border px-3 py-2 min-w-[76px] text-sm font-medium transition-colors',
                          isSelected
                            ? 'bg-gold-500 text-black border-gold-500'
                            : slot.available
                              ? 'border-border/60 hover:border-gold-500/40 hover:text-gold-400'
                              : 'border-border/30 text-muted-foreground/50 cursor-not-allowed',
                        )}
                      >
                        <span className="tabular-nums">{formatSlotTime(slot.slotStart, locale, timezone)}</span>
                        {slot.isAfterMidnight && (
                          <span className="text-[9px] font-normal opacity-80">{t('slots.afterMidnight')}</span>
                        )}
                        {!slot.available && slot.reason === 'booked' && (
                          <span className="text-[9px] font-normal opacity-80">{t('slots.booked')}</span>
                        )}
                        {!slot.available && slot.reason === 'exceeds_closing' && (
                          <span className="text-[9px] font-normal opacity-80">{t('slots.endsAfterClosing')}</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* Step 5 — Confirm */}
      <Card className={cn((!selectedStationId || !selectedSlotStart) && !confirmation && 'opacity-50 pointer-events-none')}>
        <CardHeader>
          <CardTitle className="text-lg">{t('slots.step5')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {confirmation ? (
            <div className="space-y-4 text-center">
              <PartyPopper className="h-10 w-10 mx-auto text-gold-400" />
              <div className="text-lg font-semibold">{t('scheduling.reservationConfirmedToast')}</div>
              <div className="rounded-lg border border-gold-500/20 bg-gold-500/10 p-4 space-y-2">
                <ConfirmationRow label={t('scheduling.station')} value={confirmation.stationName} />
                <ConfirmationRow
                  label={t('scheduling.window')}
                  value={`${formatFullDateTime(confirmation.scheduledStartAt, locale, timezone)} – ${formatSlotTime(confirmation.scheduledEndAt, locale, timezone)}`}
                />
                <ConfirmationRow label={t('booking.paid')} value={formatMoney(confirmation.chargedCents)} gold />
                <ConfirmationRow label={t('booking.newBalance')} value={formatMoney(confirmation.balanceCents)} />
                <ConfirmationRow label={t('booking.reference')} value={confirmation.referenceCode} mono />
              </div>
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 flex items-start gap-2 text-start">
                <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-300">{t('scheduling.arriveWarning')}</p>
              </div>
              <Button asChild variant="gold" size="xl" className="w-full">
                <Link href="/dashboard">{t('booking.done')}</Link>
              </Button>
            </div>
          ) : !selectedStationId || !selectedSlotStart ? (
            <p className="text-sm text-muted-foreground text-center py-6">{t('slots.selectSlotFirst')}</p>
          ) : (
            <>
              <div className="rounded-lg border border-border/60 p-3 space-y-1.5">
                <ConfirmationRow label={t('scheduling.station')} value={selectedStationName} />
                <ConfirmationRow
                  label={t('scheduling.window')}
                  value={
                    selectedSlotEndISO
                      ? `${formatFullDateTime(selectedSlotStart, locale, timezone)} – ${formatSlotTime(selectedSlotEndISO, locale, timezone)}`
                      : formatFullDateTime(selectedSlotStart, locale, timezone)
                  }
                />
              </div>

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

              {pricePending ? (
                <div className="text-center text-sm text-muted-foreground">{t('booking.calculatingPrice')}</div>
              ) : price !== null ? (
                <div className="rounded-lg border border-border/60 p-3 space-y-1.5">
                  {offerPreview?.applied && offerPreview.discountCents > 0 ? (
                    <>
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
                    </>
                  ) : (
                    <div className="flex justify-between text-sm font-semibold">
                      <span>{t('booking.total')}</span>
                      <span className="font-mono text-gold-400">{formatMoney(price)}</span>
                    </div>
                  )}
                </div>
              ) : null}

              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-300">{t('scheduling.arriveWarning')}</p>
              </div>

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
                {finalPrice !== null
                  ? t('scheduling.confirmReservation', { amount: formatMoney(finalPrice) })
                  : t('scheduling.confirmReservationNoPrice')}
              </Button>
            </>
          )}
        </CardContent>
      </Card>
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
