'use client';

import { useEffect, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Play, Clock } from 'lucide-react';
import { useT } from '@/i18n/context';
import { getPendingSessionsAction, startPendingSessionAction } from '@/app/(dashboard)/dashboard/cashier/actions';

interface PendingSessionRow {
  sessionId: string;
  stationId: string;
  stationCode: string;
  stationDisplayName: string;
  customerName: string | null;
  gameTypeName: string;
  addedAt: string;
}

/**
 * Paid games waiting for their timer to start — no countdown here, nothing
 * is running yet. Tapping Start is the ONLY moment a session's clock (and
 * its lights) actually begins; see startPendingSession in sessions.ts.
 * Refetches on `refreshKey` (bumped after settling a basket) plus a light
 * fallback poll, same convention as running-sessions-panel.tsx.
 */
export function ReadyToStartPanel({ branchId, refreshKey }: { branchId: string; refreshKey: number }) {
  const { t } = useT();
  const [sessions, setSessions] = useState<PendingSessionRow[]>([]);
  const [, startRefresh] = useTransition();
  const [startingId, setStartingId] = useState<string | null>(null);

  const refresh = () => {
    startRefresh(async () => {
      const res = await getPendingSessionsAction({ branchId });
      if (res.error) return;
      setSessions(res.sessions ?? []);
    });
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchId, refreshKey]);

  useEffect(() => {
    const id = setInterval(refresh, 15_000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchId]);

  const handleStart = (sessionId: string) => {
    setStartingId(sessionId);
    startRefresh(async () => {
      const res = await startPendingSessionAction({ sessionId });
      setStartingId(null);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success(t('cashier.startSession'));
      refresh();
    });
  };

  if (sessions.length === 0) return null;

  return (
    <Card className="border-blue-500/30 bg-blue-500/5">
      <CardHeader className="flex-row items-center gap-2 space-y-0">
        <Clock className="h-4 w-4 text-blue-400" />
        <CardTitle className="text-lg">{t('cashier.readyToStart')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {sessions.map((s) => (
          <div key={s.sessionId} className="flex items-center justify-between gap-3 rounded-lg border border-border/60 p-3">
            <div className="min-w-0">
              <div className="font-medium flex items-center gap-2">
                {s.stationDisplayName}
                <span className="text-xs text-muted-foreground font-mono">{s.stationCode}</span>
              </div>
              <div className="text-xs text-muted-foreground truncate">
                {s.customerName ?? '—'} · {s.gameTypeName} ·{' '}
                {t('cashier.waitingSince', { n: String(Math.max(0, Math.round((Date.now() - new Date(s.addedAt).getTime()) / 60_000))) })}
              </div>
            </div>
            <Button
              size="sm"
              variant="gold"
              className="shrink-0"
              disabled={startingId === s.sessionId}
              onClick={() => handleStart(s.sessionId)}
            >
              {startingId === s.sessionId ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
              {t('cashier.start')}
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
