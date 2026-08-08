'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2, Wallet2, X, Lock } from 'lucide-react';
import { formatMoney, formatDate } from '@/lib/utils';
import { useT } from '@/i18n/context';
import { closeShiftAction, getShiftSummaryAction } from '@/app/(dashboard)/dashboard/cashier/actions';

export interface OpenShiftState {
  id: string;
  openedAt: string;
  openingFloatCents: number;
}

interface ShiftBarProps {
  branchId: string;
  /** undefined = still loading; null = today's store-day was already closed; else the open shift. */
  shift: OpenShiftState | null | undefined;
  onShiftClosed: () => void;
}

/**
 * The shift is now the store-day's shift, auto-opened by the cashier flow's
 * own load effect (see cashier-flow.tsx / ensureShiftOpenForToday) — there
 * is no manual "open shift" step anymore. This bar only ever shows a
 * loading state, the open store-day (with a close button), or a closed
 * message; cash reconciliation on close is unchanged.
 */
export function ShiftBar({ shift, onShiftClosed }: ShiftBarProps) {
  const { t } = useT();
  const [showCloseDialog, setShowCloseDialog] = useState(false);
  const [countedCash, setCountedCash] = useState('');
  const [closeNote, setCloseNote] = useState('');
  const [collectedCents, setCollectedCents] = useState<number | null>(null);
  const [closeResult, setCloseResult] = useState<{
    expectedCashCents: number;
    expectedCardCents: number;
    expectedWalletCents: number;
    countedCashCents: number;
    varianceCents: number;
  } | null>(null);
  const [pending, startPending] = useTransition();

  const handleOpenCloseDialog = () => {
    if (!shift) return;
    startPending(async () => {
      const res = await getShiftSummaryAction({ shiftId: shift.id });
      if (res.error || !res.summary) {
        toast.error(res.error ?? t('shifts.failedToLoad'));
        return;
      }
      setCollectedCents(res.summary.totalCollectedCents);
      setShowCloseDialog(true);
    });
  };

  const handleClose = () => {
    if (!shift) return;
    const cashCents = Math.round(Number.parseFloat(countedCash || '0') * 100);
    if (!Number.isFinite(cashCents) || cashCents < 0) {
      toast.error(t('shifts.invalidAmount'));
      return;
    }
    startPending(async () => {
      const res = await closeShiftAction({ shiftId: shift.id, countedCashCents: cashCents, closeNote: closeNote.trim() || undefined });
      if (res.error || !res.result) {
        toast.error(res.error ?? t('shifts.failedToClose'));
        return;
      }
      setCloseResult(res.result);
    });
  };

  const handleDismissSummary = () => {
    setCloseResult(null);
    setShowCloseDialog(false);
    setCountedCash('');
    setCloseNote('');
    onShiftClosed();
  };

  return (
    <>
      <Card className="border-gold-500/20 bg-gold-500/5">
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
          {shift === undefined ? (
            <div className="text-sm text-muted-foreground">{t('common.loading')}</div>
          ) : shift === null ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Lock className="h-4 w-4" />
              {t('shifts.storeDayClosed')}
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 text-sm">
                <Wallet2 className="h-4 w-4 text-gold-400" />
                <span>{t('shifts.storeDaySince', { time: formatDate(shift.openedAt) })}</span>
                <span className="text-muted-foreground">
                  · {t('shifts.openingFloat')}: <span className="font-mono tabular-nums">{formatMoney(shift.openingFloatCents)}</span>
                </span>
              </div>
              <Button variant="outline" size="sm" disabled={pending} onClick={handleOpenCloseDialog}>
                {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {t('shifts.closeStoreDay')}
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      {showCloseDialog && shift && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <Card className="w-full max-w-md glass border-gold-500/30">
            <CardContent className="p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">{t('shifts.closeStoreDay')}</h3>
                <button
                  type="button"
                  onClick={() => {
                    setShowCloseDialog(false);
                    setCloseResult(null);
                  }}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {!closeResult ? (
                <>
                  <div className="rounded-lg border border-border/60 p-3 text-sm space-y-1">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{t('shifts.openingFloat')}</span>
                      <span className="font-mono tabular-nums">{formatMoney(shift.openingFloatCents)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{t('shifts.collectedThisShift')}</span>
                      <span className="font-mono tabular-nums">{collectedCents !== null ? formatMoney(collectedCents) : '—'}</span>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">{t('shifts.countedCash')}</Label>
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      value={countedCash}
                      onChange={(e) => setCountedCash(e.target.value)}
                      className="h-12 font-mono tabular-nums"
                      placeholder="0.00"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">{t('shifts.closeNoteOptional')}</Label>
                    <Input value={closeNote} onChange={(e) => setCloseNote(e.target.value)} className="h-10" />
                  </div>
                  <Button variant="gold" size="lg" className="w-full" disabled={pending} onClick={handleClose}>
                    {pending && <Loader2 className="h-4 w-4 animate-spin" />}
                    {t('shifts.closeStoreDay')}
                  </Button>
                </>
              ) : (
                <div className="space-y-3">
                  <div className="rounded-lg border border-border/60 p-3 text-sm space-y-1.5">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{t('shifts.expectedCash')}</span>
                      <span className="font-mono tabular-nums">{formatMoney(closeResult.expectedCashCents)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{t('shifts.expectedCard')}</span>
                      <span className="font-mono tabular-nums">{formatMoney(closeResult.expectedCardCents)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{t('shifts.expectedWallet')}</span>
                      <span className="font-mono tabular-nums">{formatMoney(closeResult.expectedWalletCents)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{t('shifts.countedCash')}</span>
                      <span className="font-mono tabular-nums">{formatMoney(closeResult.countedCashCents)}</span>
                    </div>
                  </div>
                  <div
                    className={`rounded-lg p-3 text-center font-mono tabular-nums text-lg font-bold ${
                      closeResult.varianceCents === 0
                        ? 'bg-emerald-500/10 text-emerald-400'
                        : 'bg-rose-500/10 text-rose-400'
                    }`}
                  >
                    {t('shifts.variance')}: {closeResult.varianceCents >= 0 ? '+' : ''}
                    {formatMoney(closeResult.varianceCents)}
                  </div>
                  <Button variant="gold" size="lg" className="w-full" onClick={handleDismissSummary}>
                    {t('common.done')}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </>
  );
}
