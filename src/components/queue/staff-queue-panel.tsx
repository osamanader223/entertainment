'use client';

import { useCallback, useEffect, useMemo, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useLiveVenueState } from '@/hooks/useLiveVenueState';
import { createClient } from '@/lib/supabase/client';
import type { PublicVenueState, PublicStation } from '@/lib/venue';
import type { StaffQueueGroup, StaffQueueTicket } from '@/lib/queue';
import { cn, formatDuration, formatMoney } from '@/lib/utils';
import { Loader2, Radio, Users, Clock, Ban, PhoneMissed, Armchair } from 'lucide-react';
import {
  listQueueAction,
  callNextTicketAction,
  seatTicketAction,
  expireTicketAction,
  staffCancelTicketAction,
} from '@/app/(dashboard)/dashboard/cashier/queue/actions';
import { useT } from '@/i18n/context';

interface StaffQueuePanelProps {
  tenantId: string;
  branchId: string;
  branchCode: string;
  staffUserId: string;
  initialGroups: StaffQueueGroup[];
  initialState?: PublicVenueState;
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

export function StaffQueuePanel({ branchId, branchCode, initialGroups, initialState }: StaffQueuePanelProps) {
  const { t } = useT();
  const { state } = useLiveVenueState(branchCode, initialState);
  const [groups, setGroups] = useState<StaffQueueGroup[]>(initialGroups);
  const [, startRefresh] = useTransition();

  const refresh = useCallback(() => {
    startRefresh(async () => {
      const res = await listQueueAction();
      if (res.ok) setGroups(res.groups);
      else toast.error(res.error);
    });
  }, []);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`staff-queue:${branchId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'queue_tickets', filter: `branch_id=eq.${branchId}` },
        () => refresh()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'sessions', filter: `branch_id=eq.${branchId}` },
        () => refresh()
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [branchId, refresh]);

  const availableStationsByGameType = useMemo(() => {
    const map = new Map<string, PublicStation[]>();
    for (const s of state?.stations ?? []) {
      if (s.status !== 'available') continue;
      const arr = map.get(s.game_type_code) ?? [];
      arr.push(s);
      map.set(s.game_type_code, arr);
    }
    return map;
  }, [state]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">{t('staffQueue.title')}</h1>
        <p className="text-muted-foreground mt-1">{t('staffQueue.subtitle')}</p>
      </div>

      <div className="flex items-center justify-end text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5 text-emerald-400">
          <Radio className="h-3.5 w-3.5 animate-pulse" />
          {t('staffQueue.live')}
        </span>
      </div>

      {groups.map((group) => (
        <QueueGroupCard
          key={group.gameTypeId}
          group={group}
          availableStations={availableStationsByGameType.get(group.gameTypeCode) ?? []}
          onChange={refresh}
        />
      ))}
    </div>
  );
}

function QueueGroupCard({
  group,
  availableStations,
  onChange,
}: {
  group: StaffQueueGroup;
  availableStations: PublicStation[];
  onChange: () => void;
}) {
  const { t, locale } = useT();
  const [callPending, startCall] = useTransition();
  const waitingCount = group.tickets.filter((ticket) => ticket.status === 'waiting').length;

  const displayName = locale === 'ar' ? (group.gameTypeNameAr || group.gameTypeName) : group.gameTypeName;

  const handleCallNext = () => {
    startCall(async () => {
      const res = await callNextTicketAction({ gameTypeId: group.gameTypeId });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(t('staffQueue.calledToast', { number: String(res.ticket.ticketNumber) }));
      onChange();
    });
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3 pb-4">
        <div className="flex items-center gap-3">
          <span className="text-2xl" aria-hidden>
            {group.icon ?? '🎮'}
          </span>
          <div>
            <CardTitle className="text-base">{displayName}</CardTitle>
            <div className="text-xs text-muted-foreground mt-0.5">
              {waitingCount > 0
                ? t('queue.waitingCount', { n: String(waitingCount) })
                : t('staffQueue.noWaiting')}
            </div>
          </div>
        </div>
        <Button variant="gold" size="sm" disabled={waitingCount === 0 || callPending} onClick={handleCallNext}>
          {callPending && <Loader2 className="h-4 w-4 animate-spin" />}
          {t('staffQueue.callNext')}
        </Button>
      </CardHeader>

      {group.tickets.length > 0 && (
        <CardContent className="space-y-2 pt-0">
          {group.tickets.map((ticket) => (
            <TicketRow key={ticket.ticketId} ticket={ticket} availableStations={availableStations} onChange={onChange} />
          ))}
        </CardContent>
      )}
    </Card>
  );
}

function TicketRow({
  ticket,
  availableStations,
  onChange,
}: {
  ticket: StaffQueueTicket;
  availableStations: PublicStation[];
  onChange: () => void;
}) {
  const { t } = useT();
  const [seating, setSeating] = useState(false);
  const [cancelPending, startCancel] = useTransition();
  const [expirePending, startExpire] = useTransition();

  const isCalled = ticket.status === 'called';
  const secondsLeft = useCountdown(isCalled ? ticket.notificationExpiresAt : null);
  const expired = isCalled && secondsLeft === 0;

  const handleCancel = () => {
    if (!window.confirm(t('staffQueue.confirmCancel', { number: String(ticket.ticketNumber), amount: formatMoney(ticket.paidCents) }))) {
      return;
    }
    startCancel(async () => {
      const res = await staffCancelTicketAction({ ticketId: ticket.ticketId });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(t('staffQueue.cancelledToast', { number: String(ticket.ticketNumber), amount: formatMoney(res.creditedCents) }));
      onChange();
    });
  };

  const handleNoShow = () => {
    if (!window.confirm(t('staffQueue.confirmNoShow', { number: String(ticket.ticketNumber) }))) return;
    startExpire(async () => {
      const res = await expireTicketAction({ ticketId: ticket.ticketId });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(t('staffQueue.noShowToast', { number: String(ticket.ticketNumber) }));
      onChange();
    });
  };

  return (
    <div className={cn('rounded-lg border border-border/60 p-3 space-y-3', isCalled && 'border-gold-500/40 bg-gold-500/5')}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="text-2xl font-bold font-mono tabular-nums text-gradient-gold">#{ticket.ticketNumber}</div>
          <div>
            <div className="text-sm font-medium">{ticket.customerName ?? 'Guest'}</div>
            <div className="text-xs text-muted-foreground flex items-center gap-2">
              <span className="inline-flex items-center gap-1">
                <Users className="h-3 w-3" />
                {ticket.playerCount}
              </span>
              <span className="inline-flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {t('staffQueue.waitingTime', { n: String(ticket.waitingMinutes) })}
              </span>
              {ticket.isVip && <span className="text-gold-400 font-semibold">{t('staffQueue.vip')}</span>}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isCalled ? (
            <div className="text-center">
              <div className="text-xs text-muted-foreground">{t('staffQueue.window')}</div>
              <div className={cn('text-sm font-mono tabular-nums font-semibold', expired ? 'text-destructive' : 'text-gold-400')}>
                {secondsLeft !== null ? formatDuration(secondsLeft) : '--:--'}
              </div>
            </div>
          ) : (
            <span className="text-xs uppercase tracking-wide rounded-full px-3 py-1 bg-muted/40 text-muted-foreground">
              {t('staffQueue.waiting')}
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {isCalled && (
          <>
            <Button variant="gold" size="sm" onClick={() => setSeating((s) => !s)}>
              <Armchair className="h-3.5 w-3.5" />
              {t('staffQueue.seat')}
            </Button>
            <Button variant="outline" size="sm" disabled={!expired || expirePending} onClick={handleNoShow}>
              {expirePending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PhoneMissed className="h-3.5 w-3.5" />}
              {t('staffQueue.noShow')}
            </Button>
          </>
        )}
        <Button variant="outline" size="sm" disabled={cancelPending} onClick={handleCancel}>
          {cancelPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Ban className="h-3.5 w-3.5" />}
          {t('staffQueue.cancelRefund')}
        </Button>
      </div>

      {seating && (
        <SeatPicker
          ticket={ticket}
          availableStations={availableStations}
          onDone={() => {
            setSeating(false);
            onChange();
          }}
          onCancel={() => setSeating(false)}
        />
      )}
    </div>
  );
}

function SeatPicker({
  ticket,
  availableStations,
  onDone,
  onCancel,
}: {
  ticket: StaffQueueTicket;
  availableStations: PublicStation[];
  onDone: () => void;
  onCancel: () => void;
}) {
  const { t } = useT();
  const [stationId, setStationId] = useState<string | null>(null);
  const [duration, setDuration] = useState<number>(60);
  const [pending, startSeat] = useTransition();

  const handleConfirm = () => {
    if (!stationId) return;
    startSeat(async () => {
      const res = await seatTicketAction({ ticketId: ticket.ticketId, stationId, durationMinutes: duration });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(t('staffQueue.seatedToast', { number: String(ticket.ticketNumber), duration: String(duration) }));
      onDone();
    });
  };

  if (availableStations.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border/60 p-3 text-center text-xs text-muted-foreground">
        {t('staffQueue.noFreeStations')}{' '}
        <button type="button" className="underline" onClick={onCancel}>
          {t('staffQueue.close')}
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border/60 p-3 space-y-3">
      <div>
        <div className="text-xs text-muted-foreground mb-2">{t('staffQueue.stationLabel')}</div>
        <div className="flex flex-wrap gap-2">
          {availableStations.map((s) => (
            <Button
              key={s.id}
              type="button"
              variant={stationId === s.id ? 'gold' : 'outline'}
              size="sm"
              onClick={() => setStationId(s.id)}
            >
              {s.display_name}
            </Button>
          ))}
        </div>
      </div>

      <div>
        <div className="text-xs text-muted-foreground mb-2">{t('staffQueue.durationLabel')}</div>
        <div className="flex flex-wrap gap-2">
          {DURATION_PRESETS.map((min) => (
            <Button
              key={min}
              type="button"
              variant={duration === min ? 'gold' : 'outline'}
              size="sm"
              onClick={() => setDuration(min)}
            >
              {min}m
            </Button>
          ))}
        </div>
      </div>

      <div className="flex gap-2">
        <Button variant="gold" size="sm" className="flex-1" disabled={!stationId || pending} onClick={handleConfirm}>
          {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {t('staffQueue.confirmSeat')}
        </Button>
        <Button variant="ghost" size="sm" onClick={onCancel}>
          {t('common.cancel')}
        </Button>
      </div>
    </div>
  );
}
