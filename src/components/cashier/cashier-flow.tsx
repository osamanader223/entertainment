'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PhonePad } from './phone-pad';
import { GameTypePicker } from './game-type-picker';
import { StationPicker } from './station-picker';
import type { PublicVenueState, PublicStation } from '@/lib/venue';
import { useLiveVenueState } from '@/hooks/useLiveVenueState';
import { cn, formatMoney, normalizePhone } from '@/lib/utils';
import { Loader2, Pencil, Banknote, Wallet, CheckCircle2, Radio } from 'lucide-react';
import {
  lookupCustomerAction,
  createWalkInCustomerAction,
  computeSessionPriceForStationAction,
  getCustomerWalletBalanceAction,
  startCashierSessionAction,
} from '@/app/(dashboard)/dashboard/cashier/actions';
import { useT } from '@/i18n/context';

interface CashierFlowProps {
  branchId: string;
  branchCode: string;
  initial?: PublicVenueState;
}

interface SelectedCustomer {
  id: string;
  full_name: string | null;
  phone: string;
}

const DURATION_PRESETS = [30, 60, 90] as const;

export function CashierFlow({ branchId, branchCode, initial }: CashierFlowProps) {
  const { t } = useT();

  // Owns the ONE live venue-state subscription for this whole flow — both
  // GameTypePicker and StationPicker read from it as props instead of each
  // subscribing themselves. useLiveVenueState's realtime channel is named
  // after the branch, and the Supabase browser client is a singleton, so a
  // second simultaneous subscriber to the same channel name previously
  // crashed with "cannot add postgres_changes callbacks after subscribe()".
  const { state: liveState, isStale } = useLiveVenueState(branchCode, initial);
  const stations = liveState?.stations ?? [];

  // --- Section 1: customer ---
  const [phone, setPhone] = useState('');
  const [customer, setCustomer] = useState<SelectedCustomer | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState('');
  const [customerPending, startCustomer] = useTransition();

  const [walletBalance, setWalletBalance] = useState<number | null>(null);
  const [walletPending, startWallet] = useTransition();

  // --- Section 2: game type + station + duration (or players/games for bowling) ---
  const [selectedGameTypeCode, setSelectedGameTypeCode] = useState<string | null>(null);
  const [selectedStation, setSelectedStation] = useState<PublicStation | null>(null);
  const [duration, setDuration] = useState<number | null>(null);
  const [showCustomDuration, setShowCustomDuration] = useState(false);
  const [customDuration, setCustomDuration] = useState('');
  const [playerCount, setPlayerCount] = useState(2);
  const [gameCount, setGameCount] = useState<1 | 2>(1);
  const [bowlingDurationMinutes, setBowlingDurationMinutes] = useState<number | null>(null);
  const [estimatedPrice, setEstimatedPrice] = useState<number | null>(null);
  const [pricePending, startPrice] = useTransition();

  const isBowling = selectedGameTypeCode?.toLowerCase().includes('bowl') ?? false;

  // --- Section 3: payment ---
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'wallet' | null>(null);
  const [seatPending, startSeat] = useTransition();

  const normalizedPhone = useMemo(() => normalizePhone(phone, 'SA'), [phone]);

  const effectiveDuration = useMemo(() => {
    if (showCustomDuration) {
      const n = Number.parseInt(customDuration, 10);
      return Number.isFinite(n) && n >= 5 && n <= 480 ? n : null;
    }
    return duration;
  }, [showCustomDuration, customDuration, duration]);

  // Resolved duration used for gating/final submit — bowling's comes from
  // the server (computeBowlingDuration via the price-preview action) instead
  // of a duration button click.
  const resolvedDuration = isBowling ? bowlingDurationMinutes : effectiveDuration;

  useEffect(() => {
    if (!customer) {
      setWalletBalance(null);
      return;
    }
    startWallet(async () => {
      const res = await getCustomerWalletBalanceAction({ customerId: customer.id });
      if (res.error) {
        toast.error(res.error);
        return;
      }
      setWalletBalance(res.balanceCents ?? null);
    });
  }, [customer]);

  // Bowling: price + duration preview driven by player/game count.
  useEffect(() => {
    if (!isBowling || !selectedStation) return;
    startPrice(async () => {
      const res = await computeSessionPriceForStationAction({
        stationId: selectedStation.id,
        playerCount,
        gameCount,
      });
      if (res.error) {
        setEstimatedPrice(null);
        setBowlingDurationMinutes(null);
        toast.error(res.error);
        return;
      }
      setEstimatedPrice(res.amountCents ?? null);
      setBowlingDurationMinutes(res.durationMinutes ?? null);
    });
  }, [isBowling, selectedStation, playerCount, gameCount]);

  // Every other game type: price preview driven by the picked duration.
  useEffect(() => {
    if (isBowling) return;
    if (!selectedStation || !effectiveDuration) {
      setEstimatedPrice(null);
      return;
    }
    startPrice(async () => {
      const res = await computeSessionPriceForStationAction({
        stationId: selectedStation.id,
        durationMinutes: effectiveDuration,
      });
      if (res.error) {
        setEstimatedPrice(null);
        toast.error(res.error);
        return;
      }
      setEstimatedPrice(res.amountCents ?? null);
    });
  }, [isBowling, selectedStation, effectiveDuration]);

  const handleFindOrCreate = () => {
    if (!normalizedPhone) {
      toast.error(t('cashier.enterSaudiPhone'));
      return;
    }
    startCustomer(async () => {
      const res = await lookupCustomerAction({ phone: normalizedPhone });
      if (res.error) {
        toast.error(res.error);
        return;
      }
      if (res.customer) {
        setCustomer(res.customer);
        setShowCreateForm(false);
      } else {
        setShowCreateForm(true);
      }
    });
  };

  const handleCreateWalkIn = () => {
    if (!normalizedPhone || newCustomerName.trim().length < 2) return;
    startCustomer(async () => {
      const res = await createWalkInCustomerAction({
        phone: normalizedPhone,
        fullName: newCustomerName.trim(),
      });
      if (res.error) {
        toast.error(res.error);
        return;
      }
      if (res.customer) {
        setCustomer(res.customer);
        setShowCreateForm(false);
      }
    });
  };

  const handleChangeCustomer = () => {
    setCustomer(null);
    setPhone('');
    setShowCreateForm(false);
    setNewCustomerName('');
    setWalletBalance(null);
    setPaymentMethod(null);
  };

  const handleSelectGameType = (code: string) => {
    setSelectedGameTypeCode(code);
    setSelectedStation(null);
    setDuration(null);
    setShowCustomDuration(false);
    setCustomDuration('');
    setPlayerCount(2);
    setGameCount(1);
    setBowlingDurationMinutes(null);
    setEstimatedPrice(null);
  };

  const walletInsufficient =
    paymentMethod === 'wallet' &&
    walletBalance !== null &&
    estimatedPrice !== null &&
    walletBalance < estimatedPrice;

  const canSeat =
    !!customer &&
    !!selectedStation &&
    !!resolvedDuration &&
    !!paymentMethod &&
    estimatedPrice !== null &&
    !walletInsufficient &&
    !seatPending;

  const handleSeatNow = () => {
    if (!customer || !selectedStation || !resolvedDuration || !paymentMethod || estimatedPrice === null) {
      return;
    }
    startSeat(async () => {
      const res = await startCashierSessionAction({
        branchId,
        stationId: selectedStation.id,
        customerId: customer.id,
        customerLabel: customer.full_name?.trim() || customer.phone,
        durationMinutes: isBowling ? undefined : (effectiveDuration ?? undefined),
        playerCount: isBowling ? playerCount : undefined,
        gameCount: isBowling ? gameCount : undefined,
        paymentMethod,
      });
      if (res.error) {
        // 'station_reserved' means an upcoming reservation on this station
        // would collide with this walk-in's duration — surface that clearly
        // rather than a raw error code.
        toast.error(res.error === 'station_reserved' ? t('scheduling.station_reserved') : res.error);
        return;
      }

      toast.success(t('cashier.sessionStarted', { station: selectedStation.display_name }), {
        icon: <CheckCircle2 className="h-4 w-4" />,
      });

      handleChangeCustomer();
      setSelectedGameTypeCode(null);
      setSelectedStation(null);
      setDuration(null);
      setShowCustomDuration(false);
      setCustomDuration('');
      setPlayerCount(2);
      setGameCount(1);
      setBowlingDurationMinutes(null);
      setEstimatedPrice(null);
    });
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Section 1 — Customer */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t('cashier.step1')}</CardTitle>
        </CardHeader>
        <CardContent>
          {customer ? (
            <div className="flex items-center justify-between rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4">
              <div>
                <div className="font-semibold">{customer.full_name || t('cashier.walkInCustomer')}</div>
                <div className="text-sm text-muted-foreground font-mono" dir="ltr">
                  {customer.phone}
                </div>
                <div className="mt-2 text-xs text-muted-foreground">
                  {walletPending ? (
                    <span className="inline-flex items-center gap-1.5">
                      <Loader2 className="h-3 w-3 animate-spin" /> {t('cashier.loadingWallet')}
                    </span>
                  ) : walletBalance !== null ? (
                    <span>
                      {t('cashier.wallet')}: <span className="font-mono text-foreground">{formatMoney(walletBalance)}</span>
                    </span>
                  ) : null}
                </div>
              </div>
              <Button variant="ghost" size="sm" onClick={handleChangeCustomer}>
                <Pencil className="h-3.5 w-3.5" />
                {t('cashier.change')}
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <Input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="05XXXXXXXX"
                dir="ltr"
                inputMode="tel"
                type="tel"
                className="h-14 text-center text-2xl font-mono tabular-nums"
              />

              <PhonePad value={phone} onChange={setPhone} />

              {phone.length > 0 && !normalizedPhone && (
                <p className="text-xs text-destructive">{t('cashier.enterSaudiPhone')}</p>
              )}

              <Button
                variant="gold"
                size="xl"
                className="w-full"
                disabled={!normalizedPhone || customerPending}
                onClick={handleFindOrCreate}
              >
                {customerPending && <Loader2 className="h-4 w-4 animate-spin" />}
                {t('cashier.findOrCreate')}
              </Button>

              {showCreateForm && (
                <div className="space-y-3 rounded-lg border border-border/60 p-4">
                  <p className="text-sm text-muted-foreground">{t('cashier.noAccountFound')}</p>
                  <div className="space-y-2">
                    <Label htmlFor="newCustomerName">{t('cashier.fullName')}</Label>
                    <Input
                      id="newCustomerName"
                      value={newCustomerName}
                      onChange={(e) => setNewCustomerName(e.target.value)}
                      placeholder="Ahmed Al-Saud"
                      className="h-12"
                    />
                  </div>
                  <Button
                    variant="gold"
                    size="lg"
                    className="w-full"
                    disabled={newCustomerName.trim().length < 2 || customerPending}
                    onClick={handleCreateWalkIn}
                  >
                    {customerPending && <Loader2 className="h-4 w-4 animate-spin" />}
                    {t('cashier.createWalkIn')}
                  </Button>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Section 2 — Game type, then station, then time (same order as the customer booking flow) */}
      <Card className={cn(!customer && 'opacity-50 pointer-events-none')}>
        <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
          <CardTitle className="text-lg">{t('cashier.step2')}</CardTitle>
          <span className={cn('inline-flex items-center gap-1.5 text-xs text-muted-foreground', isStale && 'text-amber-400')}>
            <Radio className={cn('h-3.5 w-3.5', !isStale && 'text-emerald-400 animate-pulse')} />
            {isStale ? 'refreshing…' : 'live'}
          </span>
        </CardHeader>
        <CardContent className="space-y-6">
          {!liveState ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-16 rounded-xl bg-muted/10 animate-pulse" />
              ))}
            </div>
          ) : (
            <GameTypePicker
              stations={stations}
              selectedCode={selectedGameTypeCode}
              onSelect={handleSelectGameType}
            />
          )}

          {selectedGameTypeCode && (
            <StationPicker
              stations={stations}
              gameTypeCode={selectedGameTypeCode}
              selectedStationId={selectedStation?.id ?? null}
              onSelect={setSelectedStation}
            />
          )}

          {selectedStation && isBowling && (
            <div className="space-y-4">
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
              {bowlingDurationMinutes !== null && (
                <div className="text-xs text-muted-foreground">{t('slots.estimatedDuration', { minutes: String(bowlingDurationMinutes) })}</div>
              )}
            </div>
          )}

          {selectedStation && !isBowling && (
            <>
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
                    {min} {t('cashier.minutes')}
                  </Button>
                ))}
                <Button
                  type="button"
                  variant={showCustomDuration ? 'gold' : 'outline'}
                  size="xl"
                  onClick={() => setShowCustomDuration(true)}
                >
                  {t('cashier.custom')}
                </Button>
              </div>

              {showCustomDuration && (
                <Input
                  type="number"
                  min={5}
                  max={480}
                  value={customDuration}
                  onChange={(e) => setCustomDuration(e.target.value)}
                  placeholder={t('cashier.minuteRange')}
                  className="h-12 font-mono tabular-nums"
                />
              )}
            </>
          )}

          {pricePending ? (
            <div className="text-center text-sm text-muted-foreground">{t('cashier.calculatingPrice')}</div>
          ) : estimatedPrice !== null ? (
            <div className="rounded-lg border border-gold-500/20 bg-gold-500/10 p-4 text-center">
              <div className="text-xs text-muted-foreground">{t('cashier.estimatedTotal')}</div>
              <div className="text-3xl font-bold tabular-nums text-gold-400">
                {formatMoney(estimatedPrice)}
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {/* Section 3 — Payment + Confirm */}
      <Card className={cn((!customer || !selectedStation || !resolvedDuration) && 'opacity-50 pointer-events-none')}>
        <CardHeader>
          <CardTitle className="text-lg">{t('cashier.step3')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Button
              type="button"
              variant={paymentMethod === 'cash' ? 'gold' : 'outline'}
              size="xl"
              className="h-20 flex-col gap-1.5"
              onClick={() => setPaymentMethod('cash')}
            >
              <Banknote className="h-5 w-5" />
              {t('cashier.cash')}
            </Button>
            <Button
              type="button"
              variant={paymentMethod === 'wallet' ? 'gold' : 'outline'}
              size="xl"
              className="h-20 flex-col gap-1.5"
              onClick={() => setPaymentMethod('wallet')}
            >
              <Wallet className="h-5 w-5" />
              <span>{t('cashier.walletLabel')}</span>
              {walletBalance !== null && (
                <span className="text-xs font-mono opacity-80">{formatMoney(walletBalance)}</span>
              )}
            </Button>
          </div>

          {walletInsufficient && (
            <p className="text-xs text-destructive">{t('cashier.walletInsufficient')}</p>
          )}

          <Button variant="gold" size="xl" className="w-full" disabled={!canSeat} onClick={handleSeatNow}>
            {seatPending && <Loader2 className="h-4 w-4 animate-spin" />}
            {t('cashier.seatNow')}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
