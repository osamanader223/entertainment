'use client';

import { useCallback, useEffect, useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useLiveVenueState } from '@/hooks/useLiveVenueState';
import { createClient } from '@/lib/supabase/client';
import type { PublicVenueState } from '@/lib/venue';
import type { CustomerQueueTicket, QueueableGameType } from '@/lib/queue';
import { cn, formatDuration, formatMoney } from '@/lib/utils';
import { Loader2, Wallet, Ticket, Users, Radio } from 'lucide-react';
import {
  getQueuePriceAction,
  joinQueueAction,
  cancelMyTicketAction,
  getMyTicketsAction,
} from '@/app/(dashboard)/dashboard/queue/actions';
import { useT } from '@/i18n/context';

interface QueueFlowProps {
  branchId: string;
  branchCode: string;
  initialWalletBalanceCents: number;
  initialTickets: CustomerQueueTicket[];
  gameTypes: QueueableGameType[];
  initial?: PublicVenueState;
}

const DURATION_PRESETS = [30, 60, 90] as const;

function useCountdown(target: string | null): number | null {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!target) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [target]);

  if (!target) return null;
  return Math.max(0, Math.floor((new Date(target).getTime() - now) / 1000));
}

export function QueueFlow({ branchId, branchCode, initialWalletBalanceCents, initialTickets, gameTypes, initial }: QueueFlowProps) {
  const { t } = useT();
  const { state } = useLiveVenueState(branchCode, initial);
  const [walletBalance, setWalletBalance] = useState(initialWalletBalanceCents);
  const [tickets, setTickets] = useState<CustomerQueueTicket[]>(initialTickets);
  const [, startRefresh] = useTransition();

  const refreshTickets = useCallback(() => {
    startRefresh(async () => {
      const res = await getMyTicketsAction();
      if (res.ok) setTickets(res.tickets);
    });
  }, []);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`my-queue:${branchId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'queue_tickets', filter: `branch_id=eq.${branchId}` },
        () => refreshTickets()
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [branchId, refreshTickets]);

  const waitingDepthByCode = useMemo(() => {
    const map = new Map<string, number>();
    for (const g of state?.queue ?? []) map.set(g.game_type_code, g.waiting_count);
    return map;
  }, [state]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">{t('queue.title')}</h1>
        <p className="text-muted-foreground mt-1">{t('queue.subtitle')}</p>
      </div>

      {tickets.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-baseline justify-between">
            <h2 className="text-xl font-semibold">{t('queue.myTickets')}</h2>
            <span className="inline-flex items-center gap-1.5 text-xs text-emerald-400">
              <Radio className="h-3.5 w-3.5 animate-pulse" />
              {t('queue.live')}
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {tickets.map((ticket) => (
              <TicketCard
                key={ticket.ticketId}
                ticket={ticket}
                onCancelled={(balanceCents) => {
                  setWalletBalance(balanceCents);
                  refreshTickets();
                }}
              />
            ))}
          </div>
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">{t('queue.joinAQueue')}</h2>

        <div className="rounded-lg border border-border/60 p-4 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Wallet className="h-4 w-4" />
            {t('queue.walletBalance')}
          </div>
          <div className="font-mono text-lg">{formatMoney(walletBalance)}</div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {gameTypes.map((gt) => (
            <JoinQueueCard
              key={gt.id}
              gameType={gt}
              waitingCount={waitingDepthByCode.get(gt.code) ?? 0}
              walletBalance={walletBalance}
              onJoined={(balanceCents) => {
                setWalletBalance(balanceCents);
                refreshTickets();
              }}
            />
          ))}
        </div>
      </section>
    </div>
  );
}

function TicketCard({
  ticket,
  onCancelled,
}: {
  ticket: CustomerQueueTicket;
  onCancelled: (balanceCents: number) => void;
}) {
  const { t, locale } = useT();
  const [pending, startPending] = useTransition();
  const isCalled = ticket.status === 'called';
  const secondsLeft = useCountdown(isCalled ? ticket.notificationExpiresAt : null);

  const gameTypeName = locale === 'ar' ? (ticket.gameTypeNameAr || ticket.gameTypeName) : ticket.gameTypeName;

  const handleCancel = () => {
    if (!window.confirm(t('queue.cancelConfirm', { number: String(ticket.ticketNumber), amount: formatMoney(ticket.paidCents) }))) {
      return;
    }
    startPending(async () => {
      const res = await cancelMyTicketAction({ ticketId: ticket.ticketId });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(t('queue.cancelledToast', { amount: formatMoney(res.creditedCents) }));
      onCancelled(res.balanceCents);
    });
  };

  return (
    <Card className={cn(isCalled && 'border-gold-500/40 shadow-lg shadow-gold-500/10')}>
      <CardContent className="p-5 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-xs text-muted-foreground">{gameTypeName}</div>
            <div className="text-4xl font-bold font-mono tabular-nums text-gradient-gold">#{ticket.ticketNumber}</div>
          </div>
          <span
            className={cn(
              'text-xs font-semibold uppercase tracking-wide rounded-full px-3 py-1 text-center',
              isCalled ? 'bg-gold-500/20 text-gold-400' : 'bg-muted/40 text-muted-foreground'
            )}
          >
            {isCalled ? t('queue.yourTurn') : t('queue.waiting')}
          </span>
        </div>

        {isCalled ? (
          <div className="rounded-lg border border-gold-500/30 bg-gold-500/10 p-3 text-center">
            <div className="text-xs text-muted-foreground">{t('queue.showUpWithin')}</div>
            <div className="text-2xl font-bold font-mono tabular-nums text-gold-400">
              {secondsLeft !== null ? formatDuration(secondsLeft) : '--:--'}
            </div>
          </div>
        ) : (
          <div className="text-sm text-muted-foreground">
            {ticket.positionAhead === 0
              ? t('queue.youreNext')
              : t('queue.aheadOfYou', { n: String(ticket.positionAhead) })}
          </div>
        )}

        <Button variant="outline" size="sm" className="w-full" disabled={pending} onClick={handleCancel}>
          {pending && <Loader2 className="h-4 w-4 animate-spin" />}
          {t('queue.cancelForCredit', { amount: formatMoney(ticket.paidCents) })}
        </Button>
      </CardContent>
    </Card>
  );
}

function JoinQueueCard({
  gameType,
  waitingCount,
  walletBalance,
  onJoined,
}: {
  gameType: QueueableGameType;
  waitingCount: number;
  walletBalance: number;
  onJoined: (balanceCents: number) => void;
}) {
  const { t, locale } = useT();
  const [expanded, setExpanded] = useState(false);
  const [playerCount, setPlayerCount] = useState(gameType.minPlayers);
  const [duration, setDuration] = useState<number | null>(
    DURATION_PRESETS.includes(gameType.defaultDurationMin as 30 | 60 | 90) ? gameType.defaultDurationMin : 60
  );
  const [showCustomDuration, setShowCustomDuration] = useState(false);
  const [customDuration, setCustomDuration] = useState('');

  const [price, setPrice] = useState<number | null>(null);
  const [pricePending, startPrice] = useTransition();
  const [joinPending, startJoin] = useTransition();

  const effectiveDuration = useMemo(() => {
    if (showCustomDuration) {
      const n = Number.parseInt(customDuration, 10);
      return Number.isFinite(n) && n >= 5 && n <= 480 ? n : null;
    }
    return duration;
  }, [showCustomDuration, customDuration, duration]);

  useEffect(() => {
    if (!expanded || !effectiveDuration) {
      setPrice(null);
      return;
    }
    startPrice(async () => {
      const res = await getQueuePriceAction({ gameTypeId: gameType.id, durationMinutes: effectiveDuration });
      if (res.error) {
        setPrice(null);
        toast.error(res.error);
        return;
      }
      setPrice(res.amountCents ?? null);
    });
  }, [expanded, effectiveDuration, gameType.id]);

  const insufficientFunds = price !== null && walletBalance < price;
  const canJoin = !!effectiveDuration && price !== null && !insufficientFunds && !joinPending;

  const handleJoin = () => {
    if (!effectiveDuration || price === null) return;
    startJoin(async () => {
      const res = await joinQueueAction({ gameTypeId: gameType.id, playerCount, durationMinutes: effectiveDuration });
      if (!res.ok) {
        toast.error(res.error === 'insufficient_funds' ? 'Insufficient wallet credit' : res.error);
        return;
      }
      toast.success(t('queue.joinSuccess', { number: String(res.ticketNumber) }));
      onJoined(res.balanceCents);
      setExpanded(false);
    });
  };

  const showPlayerCount = gameType.supportsPlayerCount && gameType.maxPlayers > 1;
  const displayName = locale === 'ar' ? (gameType.displayNameAr || gameType.displayNameEn) : gameType.displayNameEn;

  return (
    <Card className={cn(expanded && 'ring-1 ring-gold-500/30')}>
      <CardHeader className="cursor-pointer pb-4" onClick={() => setExpanded((e) => !e)}>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="text-2xl" aria-hidden>
              {gameType.icon ?? '🎮'}
            </span>
            <div>
              <CardTitle className="text-base">{displayName}</CardTitle>
              <div className="text-xs text-muted-foreground mt-0.5">
                {waitingCount > 0
                  ? t('queue.waitingCount', { n: String(waitingCount) })
                  : t('queue.noWait')}
              </div>
            </div>
          </div>
          <Ticket className="h-5 w-5 text-muted-foreground" />
        </div>
      </CardHeader>

      {expanded && (
        <CardContent className="space-y-4 pt-0">
          {showPlayerCount && (
            <div>
              <div className="text-xs text-muted-foreground mb-2 flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5" />
                {t('queue.players')}
              </div>
              <div className="flex flex-wrap gap-2">
                {Array.from(
                  { length: gameType.maxPlayers - gameType.minPlayers + 1 },
                  (_, i) => gameType.minPlayers + i
                ).map((n) => (
                  <Button
                    key={n}
                    type="button"
                    variant={playerCount === n ? 'gold' : 'outline'}
                    size="sm"
                    onClick={() => setPlayerCount(n)}
                  >
                    {n}
                  </Button>
                ))}
              </div>
            </div>
          )}

          <div>
            <div className="text-xs text-muted-foreground mb-2">{t('queue.duration')}</div>
            <div className="grid grid-cols-4 gap-2">
              {DURATION_PRESETS.map((min) => (
                <Button
                  key={min}
                  type="button"
                  variant={!showCustomDuration && duration === min ? 'gold' : 'outline'}
                  size="sm"
                  onClick={() => {
                    setDuration(min);
                    setShowCustomDuration(false);
                  }}
                >
                  {min}m
                </Button>
              ))}
              <Button
                type="button"
                variant={showCustomDuration ? 'gold' : 'outline'}
                size="sm"
                onClick={() => setShowCustomDuration(true)}
              >
                {t('queue.custom')}
              </Button>
            </div>
            {showCustomDuration && (
              <Input
                type="number"
                min={5}
                max={480}
                value={customDuration}
                onChange={(e) => setCustomDuration(e.target.value)}
                placeholder={t('queue.minuteRange')}
                className="h-10 font-mono tabular-nums mt-2"
              />
            )}
          </div>

          {pricePending ? (
            <div className="text-center text-sm text-muted-foreground">{t('booking.calculatingPrice')}</div>
          ) : price !== null ? (
            <div className="rounded-lg border border-gold-500/20 bg-gold-500/10 p-3 text-center">
              <div className="text-xs text-muted-foreground">{t('queue.total')}</div>
              <div className="text-2xl font-bold tabular-nums text-gold-400">{formatMoney(price)}</div>
            </div>
          ) : null}

          {insufficientFunds && price !== null && (
            <div className="space-y-1">
              <p className="text-xs text-destructive">
                {t('queue.insufficientCredit', {
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

          <Button variant="gold" size="lg" className="w-full" disabled={!canJoin} onClick={handleJoin}>
            {joinPending && <Loader2 className="h-4 w-4 animate-spin" />}
            {price !== null
              ? t('queue.joinButton', { amount: formatMoney(price) })
              : t('queue.selectDuration')}
          </Button>
        </CardContent>
      )}
    </Card>
  );
}
