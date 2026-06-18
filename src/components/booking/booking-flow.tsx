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
import { Loader2, Wallet, CheckCircle2, PartyPopper } from 'lucide-react';
import { getBookingPriceAction, createBookingAction } from '@/app/(dashboard)/dashboard/book/actions';
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
  balanceCents: number;
  referenceCode: string;
}

const DURATION_PRESETS = [30, 60, 90] as const;

export function BookingFlow({ branchCode, initialWalletBalanceCents, initial }: BookingFlowProps) {
  const { t } = useT();
  const [selectedStation, setSelectedStation] = useState<PublicStation | null>(null);
  const [duration, setDuration] = useState<number | null>(null);
  const [showCustomDuration, setShowCustomDuration] = useState(false);
  const [customDuration, setCustomDuration] = useState('');

  const [price, setPrice] = useState<number | null>(null);
  const [pricePending, startPrice] = useTransition();

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
    if (!selectedStation || !effectiveDuration) {
      setPrice(null);
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

  const insufficientFunds = price !== null && walletBalance < price;
  const canConfirm =
    !!selectedStation && !!effectiveDuration && price !== null && !insufficientFunds && !confirmPending;
  const step3Ready = !!selectedStation && !!effectiveDuration && price !== null;

  const handleConfirm = () => {
    if (!selectedStation || !effectiveDuration || price === null) return;
    startConfirm(async () => {
      const res = await createBookingAction({
        stationId: selectedStation.id,
        durationMinutes: effectiveDuration,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }

      setWalletBalance(res.balanceCents);
      setConfirmation({
        stationName: selectedStation.display_name,
        durationMinutes: effectiveDuration,
        amountCents: res.amountCents,
        balanceCents: res.balanceCents,
        referenceCode: res.referenceCode,
      });
      toast.success(t('booking.bookingConfirmedToast'), {
        icon: <CheckCircle2 className="h-4 w-4" />,
      });
    });
  };

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
                </div>
                <div className="rounded-lg border border-gold-500/20 bg-gold-500/10 p-4 space-y-2">
                  <ConfirmationRow label={t('booking.paid')} value={formatMoney(confirmation.amountCents)} gold />
                  <ConfirmationRow label={t('booking.newBalance')} value={formatMoney(confirmation.balanceCents)} />
                  <ConfirmationRow label={t('booking.reference')} value={confirmation.referenceCode} mono />
                </div>
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

                {insufficientFunds && price !== null && (
                  <div className="space-y-1">
                    <p className="text-xs text-destructive">
                      {t('booking.insufficientCredit', {
                        current: formatMoney(walletBalance),
                        needed: formatMoney(price),
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

                <Button variant="gold" size="xl" className="w-full" disabled={!canConfirm} onClick={handleConfirm}>
                  {confirmPending && <Loader2 className="h-4 w-4 animate-spin" />}
                  {price !== null
                    ? t('booking.confirmBooking', { amount: formatMoney(price) })
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

function ConfirmationRow({ label, value, gold, mono }: { label: string; value: string; gold?: boolean; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn(mono && 'font-mono', gold && 'text-gold-400 font-semibold')}>{value}</span>
    </div>
  );
}
