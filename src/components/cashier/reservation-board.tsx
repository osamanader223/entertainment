'use client';

import { useCallback, useEffect, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { createClient } from '@/lib/supabase/client';
import { cn, translateReason } from '@/lib/utils';
import { useT } from '@/i18n/context';
import type { ReservationBoardRow } from '@/lib/cashier-reservations';
import {
  getReservationBoardAction,
  markPresentAction,
  startNowAction,
  startBookingEarlyAction,
  noShowAction,
  cancelReservationAction,
} from '@/app/(dashboard)/dashboard/cashier/reservations/actions';
import { CalendarClock, UserCheck, Play, UserX, Ban, Loader2, AlertTriangle, Clock, X } from 'lucide-react';

const STATUS_BADGE: Record<string, string> = {
  confirmed: 'bg-blue-500/15 text-blue-300 border-blue-500/30',
  checked_in: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  in_session: 'bg-gold-500/15 text-gold-400 border-gold-500/30',
};

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

interface EarlyPrompt {
  bookingId: string;
  stationName: string;
  kind: 'simple' | 'collision';
  minutesEarly: number;
  newStart: string;
  newEnd: string;
  collisionInfo?: { customerName?: string; time: string };
}

export function ReservationBoard({ branchId, initialReservations }: { branchId: string; initialReservations: ReservationBoardRow[] }) {
  const { t } = useT();
  const [reservations, setReservations] = useState(initialReservations);
  const [, startRefresh] = useTransition();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [earlyPrompt, setEarlyPrompt] = useState<EarlyPrompt | null>(null);
  const [dialogPending, setDialogPending] = useState(false);

  const refresh = useCallback(() => {
    startRefresh(async () => {
      const res = await getReservationBoardAction({ branchId });
      if (res.ok) setReservations(res.reservations);
    });
  }, [branchId]);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`reservations:${branchId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings', filter: `branch_id=eq.${branchId}` }, () => refresh())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sessions', filter: `branch_id=eq.${branchId}` }, () => refresh())
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [branchId, refresh]);

  // Refresh every 30s too, so minutesUntilStart / cutoff-eligibility stay accurate.
  useEffect(() => {
    const id = setInterval(refresh, 30_000);
    return () => clearInterval(id);
  }, [refresh]);

  const runAction = (bookingId: string, fn: () => Promise<{ ok: boolean; error?: string }>, successMsg: string) => {
    setPendingId(bookingId);
    startRefresh(async () => {
      const res = await fn();
      setPendingId(null);
      if (!res.ok) {
        toast.error(res.error ? translateReason(t, 'scheduling', res.error) : t('scheduling.actionFailed'));
        return;
      }
      toast.success(successMsg);
      refresh();
    });
  };

  const handleStartEarlyClick = (r: ReservationBoardRow) => {
    setPendingId(r.bookingId);
    startRefresh(async () => {
      const res = await startBookingEarlyAction({ bookingId: r.bookingId });
      setPendingId(null);
      if (res.ok) {
        toast.success(t('scheduling.checkedInEarly'));
        refresh();
        return;
      }
      if (res.needsConfirmation && res.newStart && res.newEnd) {
        setEarlyPrompt({
          bookingId: r.bookingId,
          stationName: r.stationName,
          kind: res.needsConfirmation,
          minutesEarly: Math.max(0, Math.round((new Date(r.scheduledStartAt).getTime() - new Date(res.newStart).getTime()) / 60_000)),
          newStart: res.newStart,
          newEnd: res.newEnd,
          collisionInfo: res.collisionInfo,
        });
        return;
      }
      if (res.error === 'too_early') {
        toast.error(t('scheduling.tooEarly', { time: res.newStart ? formatTime(res.newStart) : '' }));
        return;
      }
      toast.error(res.error ? translateReason(t, 'scheduling', res.error) : t('scheduling.actionFailed'));
    });
  };

  const handleConfirmEarly = () => {
    if (!earlyPrompt) return;
    const { bookingId } = earlyPrompt;
    setDialogPending(true);
    startRefresh(async () => {
      const res = await startBookingEarlyAction({ bookingId, force: true });
      setDialogPending(false);
      setEarlyPrompt(null);
      if (!res.ok) {
        toast.error(res.error ? translateReason(t, 'scheduling', res.error) : t('scheduling.actionFailed'));
        return;
      }
      toast.success(t('scheduling.checkedInEarly'));
      refresh();
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <CalendarClock className="h-6 w-6 text-gold-400" />
        <div>
          <h1 className="text-2xl font-bold">{t('scheduling.reservations')}</h1>
          <p className="text-sm text-muted-foreground">{t('scheduling.reservationsSubtitle')}</p>
        </div>
      </div>

      {reservations.length === 0 ? (
        <p className="text-sm text-muted-foreground py-10 text-center">{t('scheduling.noReservationsToday')}</p>
      ) : (
        <div className="space-y-3">
          {reservations.map((r) => {
            const soon = r.minutesUntilStart <= 30 && r.minutesUntilStart >= -5 && r.status !== 'in_session';
            const canMarkPresent = !r.customerPresent && r.status === 'confirmed';
            const canStartNow = r.status !== 'in_session' && r.minutesUntilStart <= 0;
            const canStartEarly = (r.status === 'confirmed' || r.status === 'checked_in') && r.minutesUntilStart > 0;
            const canNoShow = !r.customerPresent && r.status === 'confirmed' && r.minutesUntilStart <= 10;
            const canCancel = r.status === 'confirmed' && r.minutesUntilStart > 10;
            const isPending = pendingId === r.bookingId;

            return (
              <Card key={r.bookingId} className={cn('glass', soon && 'border-gold-500/40')}>
                <CardContent className="p-4 flex flex-wrap items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div className="text-center min-w-[64px]">
                      <div className="text-lg font-bold font-mono tabular-nums">
                        {new Date(r.scheduledStartAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        {r.minutesUntilStart > 0
                          ? t('scheduling.inMinutes', { n: String(r.minutesUntilStart) })
                          : r.status === 'in_session'
                            ? t('scheduling.started')
                            : t('scheduling.overdue')}
                      </div>
                    </div>
                    <div>
                      <div className="font-semibold flex items-center gap-2">
                        {r.stationName}
                        <span className={cn('inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase', STATUS_BADGE[r.status] ?? '')}>
                          {t(`scheduling.status_${r.status}`)}
                        </span>
                        {r.customerPresent && (
                          <span className="inline-flex items-center gap-1 text-[10px] text-emerald-400">
                            <UserCheck className="h-3 w-3" /> {t('scheduling.arrived')}
                          </span>
                        )}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {r.customerName ?? r.customerPhone ?? '—'} · {r.gameTypeName} · {r.durationMinutes} {t('booking.min')}
                      </div>
                      <div className="text-xs text-muted-foreground font-mono">{r.referenceCode}</div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    {canMarkPresent && (
                      <Button size="sm" variant="outline" disabled={isPending} onClick={() => runAction(r.bookingId, () => markPresentAction({ bookingId: r.bookingId }), t('scheduling.markedPresent'))}>
                        {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserCheck className="h-3.5 w-3.5" />}
                        {t('scheduling.customerArrived')}
                      </Button>
                    )}
                    {canStartNow && (
                      <Button size="sm" variant="gold" disabled={isPending} onClick={() => runAction(r.bookingId, () => startNowAction({ bookingId: r.bookingId }), t('scheduling.sessionStarted'))}>
                        {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                        {t('scheduling.startNow')}
                      </Button>
                    )}
                    {canStartEarly && (
                      <Button size="sm" variant="outline" disabled={isPending} onClick={() => handleStartEarlyClick(r)}>
                        {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Clock className="h-3.5 w-3.5" />}
                        {t('scheduling.startEarly')}
                      </Button>
                    )}
                    {canNoShow && (
                      <Button size="sm" variant="outline" className="text-destructive hover:text-destructive" disabled={isPending} onClick={() => runAction(r.bookingId, () => noShowAction({ bookingId: r.bookingId }), t('scheduling.markedNoShow'))}>
                        {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserX className="h-3.5 w-3.5" />}
                        {t('scheduling.noShow')}
                      </Button>
                    )}
                    {canCancel && (
                      <Button size="sm" variant="ghost" className="text-muted-foreground" disabled={isPending} onClick={() => runAction(r.bookingId, () => cancelReservationAction({ bookingId: r.bookingId }), t('scheduling.reservationCancelled'))}>
                        <Ban className="h-3.5 w-3.5" />
                        {t('scheduling.cancelBooking')}
                      </Button>
                    )}
                  </div>
                </CardContent>

                {soon && r.status === 'confirmed' && (
                  <div className="px-4 pb-3 -mt-2 flex items-center gap-1.5 text-xs text-gold-400">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    {t('scheduling.startingSoon')}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {earlyPrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          {earlyPrompt.kind === 'collision' ? (
            <Card className="w-full max-w-md glass border-rose-500/50 bg-rose-500/5">
              <CardContent className="p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-rose-400 flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5" />
                    {t('scheduling.collisionTitle')}
                  </h3>
                  <button type="button" onClick={() => setEarlyPrompt(null)} className="text-muted-foreground hover:text-foreground">
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <p className="text-sm text-rose-300 font-medium">
                  {earlyPrompt.collisionInfo?.customerName
                    ? t('scheduling.collisionWarning', {
                        name: earlyPrompt.collisionInfo.customerName,
                        time: formatTime(earlyPrompt.collisionInfo.time),
                      })
                    : t('scheduling.collisionWarningNoName', {
                        time: earlyPrompt.collisionInfo ? formatTime(earlyPrompt.collisionInfo.time) : '',
                      })}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t('scheduling.sessionWillRun', { range: `${formatTime(earlyPrompt.newStart)}–${formatTime(earlyPrompt.newEnd)}` })}
                </p>
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1" disabled={dialogPending} onClick={() => setEarlyPrompt(null)}>
                    {t('common.cancel')}
                  </Button>
                  <Button
                    className="flex-1 bg-rose-600 text-white hover:bg-rose-700"
                    disabled={dialogPending}
                    onClick={handleConfirmEarly}
                  >
                    {dialogPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    {t('scheduling.startAnyway')}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card className="w-full max-w-sm glass border-gold-500/30">
              <CardContent className="p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold">{t('scheduling.startEarly')}</h3>
                  <button type="button" onClick={() => setEarlyPrompt(null)} className="text-muted-foreground hover:text-foreground">
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <p className="text-sm">{t('scheduling.startMinutesEarly', { n: String(earlyPrompt.minutesEarly) })}</p>
                <p className="text-xs text-muted-foreground">
                  {t('scheduling.sessionWillRun', { range: `${formatTime(earlyPrompt.newStart)}–${formatTime(earlyPrompt.newEnd)}` })}
                </p>
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1" disabled={dialogPending} onClick={() => setEarlyPrompt(null)}>
                    {t('common.cancel')}
                  </Button>
                  <Button variant="gold" className="flex-1" disabled={dialogPending} onClick={handleConfirmEarly}>
                    {dialogPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    {t('common.confirm')}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
