'use client';

import { useEffect, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Square, Radio } from 'lucide-react';
import { useT } from '@/i18n/context';
import { getActiveSessionsAction, endSessionAction } from '@/app/(dashboard)/dashboard/cashier/actions';

interface ActiveSessionRow {
  sessionId: string;
  stationId: string;
  stationCode: string;
  stationDisplayName: string;
  customerName: string | null;
  startedAt: string;
  endsAt: string | null;
  status: 'active' | 'paused';
}

function formatRemaining(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * Every currently running session on the branch, with a live countdown and
 * an "End session" action right on this screen — no navigating elsewhere.
 * Refetches whenever `refreshSignal` changes (the parent passes the venue
 * state's own fetched_at/realtime tick) rather than opening a second
 * realtime channel of its own.
 */
export function RunningSessionsPanel({ branchId, refreshSignal }: { branchId: string; refreshSignal: string }) {
  const { t } = useT();
  const [sessions, setSessions] = useState<ActiveSessionRow[]>([]);
  const [, startRefresh] = useTransition();
  const [endingStationId, setEndingStationId] = useState<string | null>(null);
  const [, forceTick] = useState(0);

  const refresh = () => {
    startRefresh(async () => {
      const res = await getActiveSessionsAction({ branchId });
      if (res.error) return;
      setSessions(res.sessions ?? []);
    });
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchId, refreshSignal]);

  // Local 1s tick just to re-render the countdowns — data itself only
  // refetches on refreshSignal, not every second.
  useEffect(() => {
    const id = setInterval(() => forceTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const handleEnd = (stationId: string) => {
    setEndingStationId(stationId);
    startRefresh(async () => {
      const res = await endSessionAction({ stationId });
      setEndingStationId(null);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success(t('cashier.sessionEnded'));
      refresh();
    });
  };

  if (sessions.length === 0) return null;

  return (
    <Card>
      <CardHeader className="flex-row items-center gap-2 space-y-0">
        <Radio className="h-4 w-4 text-emerald-400 animate-pulse" />
        <CardTitle className="text-lg">{t('cashier.runningSessions')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {sessions.map((s) => {
          const remainingMs = s.endsAt ? new Date(s.endsAt).getTime() - Date.now() : null;
          const isOver = remainingMs !== null && remainingMs <= 0;
          return (
            <div key={s.sessionId} className="flex items-center justify-between gap-3 rounded-lg border border-border/60 p-3">
              <div className="min-w-0">
                <div className="font-medium flex items-center gap-2">
                  {s.stationDisplayName}
                  <span className="text-xs text-muted-foreground font-mono">{s.stationCode}</span>
                </div>
                <div className="text-xs text-muted-foreground truncate">{s.customerName ?? '—'}</div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                {remainingMs !== null && (
                  <span className={`font-mono tabular-nums text-sm ${isOver ? 'text-rose-400 animate-pulse' : 'text-gold-400'}`}>
                    {isOver ? t('station.endingNow') : formatRemaining(remainingMs)}
                  </span>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  className="text-destructive hover:text-destructive"
                  disabled={endingStationId === s.stationId}
                  onClick={() => handleEnd(s.stationId)}
                >
                  {endingStationId === s.stationId ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Square className="h-3.5 w-3.5" />}
                  {t('cashier.endSession')}
                </Button>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
