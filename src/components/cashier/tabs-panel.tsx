'use client';

import { useEffect, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Receipt, X, Trash2 } from 'lucide-react';
import { formatMoney } from '@/lib/utils';
import { useT } from '@/i18n/context';
import { getOpenTabsAction, getTabAction, voidTabAction, settleTabAction } from '@/app/(dashboard)/dashboard/cashier/actions';

export interface OpenTabSummary {
  id: string;
  label: string | null;
  customerId: string | null;
  customerName: string | null;
  openedAt: string;
  itemCount: number;
  totalCents: number;
}

interface TabsPanelProps {
  branchId: string;
  refreshKey: number;
}

interface SettleLine {
  method: 'cash' | 'card' | 'wallet';
  amount: string;
}

export function TabsPanel({ branchId, refreshKey }: TabsPanelProps) {
  const { t } = useT();
  const [tabs, setTabs] = useState<OpenTabSummary[]>([]);
  const [loading, startLoading] = useTransition();
  const [settleTabId, setSettleTabId] = useState<string | null>(null);
  const [settleTotalCents, setSettleTotalCents] = useState(0);
  const [settleItems, setSettleItems] = useState<Array<{ description: string; amountCents: number }>>([]);
  const [lines, setLines] = useState<SettleLine[]>([{ method: 'cash', amount: '' }]);
  const [settlePending, startSettle] = useTransition();
  const [settleResult, setSettleResult] = useState<{ changeCents: number; invoiceId?: string } | null>(null);

  const refresh = () => {
    startLoading(async () => {
      const res = await getOpenTabsAction({ branchId });
      if (res.error) {
        toast.error(res.error);
        return;
      }
      setTabs(res.tabs ?? []);
    });
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchId, refreshKey]);

  const openSettle = (tabId: string) => {
    startSettle(async () => {
      const res = await getTabAction({ tabId });
      if (res.error || !res.tab) {
        toast.error(res.error ?? 'Failed to load tab');
        return;
      }
      setSettleTabId(tabId);
      setSettleTotalCents(res.tab.totalCents);
      setSettleItems(res.tab.items.map((i) => ({ description: i.description, amountCents: i.amountCents })));
      setLines([{ method: 'cash', amount: '' }]);
      setSettleResult(null);
    });
  };

  const paidSoFarCents = lines.reduce((sum, l) => {
    const n = Math.round(Number.parseFloat(l.amount || '0') * 100);
    return sum + (Number.isFinite(n) ? n : 0);
  }, 0);
  const remainingCents = settleTotalCents - paidSoFarCents;

  const handleAddLine = () => setLines((ls) => [...ls, { method: 'cash', amount: '' }]);
  const handleRemoveLine = (idx: number) => setLines((ls) => ls.filter((_, i) => i !== idx));
  const handleLineChange = (idx: number, patch: Partial<SettleLine>) =>
    setLines((ls) => ls.map((l, i) => (i === idx ? { ...l, ...patch } : l)));

  const handleSettle = () => {
    if (!settleTabId) return;
    if (paidSoFarCents < settleTotalCents) {
      toast.error(t('tabs.notEnoughPaid'));
      return;
    }
    const payments = lines
      .map((l) => ({ method: l.method, amountCents: Math.round(Number.parseFloat(l.amount || '0') * 100) }))
      .filter((p) => p.amountCents > 0);

    startSettle(async () => {
      const res = await settleTabAction({ tabId: settleTabId, payments });
      if (res.error || !res.result) {
        toast.error(res.error ?? t('tabs.failedToSettle'));
        return;
      }
      setSettleResult({ changeCents: res.result.changeCents, invoiceId: res.result.invoiceId });
      refresh();
    });
  };

  const handleVoid = (tabId: string) => {
    startSettle(async () => {
      const res = await voidTabAction({ tabId, reason: 'Cancelled at cashier' });
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success(t('tabs.tabVoided'));
      refresh();
    });
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t('tabs.openTabs')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading && tabs.length === 0 ? (
            <div className="text-sm text-muted-foreground">{t('common.loading')}</div>
          ) : tabs.length === 0 ? (
            <div className="text-sm text-muted-foreground">{t('tabs.noOpenTabs')}</div>
          ) : (
            tabs.map((tab) => (
              <div key={tab.id} className="flex items-center justify-between gap-3 rounded-lg border border-border/60 p-3">
                <div>
                  <div className="font-medium">{tab.customerName || tab.label || t('tabs.unlabeledTab')}</div>
                  <div className="text-xs text-muted-foreground">
                    {tab.itemCount} {t('tabs.items')} · <span className="font-mono tabular-nums">{formatMoney(tab.totalCents)}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="sm" onClick={() => handleVoid(tab.id)} title={t('tabs.voidTab')}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="gold" size="sm" onClick={() => openSettle(tab.id)}>
                    <Receipt className="h-3.5 w-3.5" />
                    {t('tabs.settle')}
                  </Button>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {settleTabId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <Card className="w-full max-w-lg glass border-gold-500/30 max-h-[90vh] overflow-y-auto">
            <CardContent className="p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">{t('tabs.settle')}</h3>
                <button type="button" onClick={() => setSettleTabId(null)} className="text-muted-foreground hover:text-foreground">
                  <X className="h-4 w-4" />
                </button>
              </div>

              {!settleResult ? (
                <>
                  <div className="rounded-lg border border-border/60 p-3 text-sm space-y-1 max-h-32 overflow-y-auto">
                    {settleItems.map((item, i) => (
                      <div key={i} className="flex justify-between">
                        <span className="text-muted-foreground">{item.description}</span>
                        <span className="font-mono tabular-nums">{formatMoney(item.amountCents)}</span>
                      </div>
                    ))}
                  </div>
                  <div className="rounded-lg bg-gold-500/10 border border-gold-500/20 p-3 flex justify-between items-center">
                    <span className="text-sm">{t('tabs.totalDue')}</span>
                    <span className="text-xl font-bold font-mono tabular-nums text-gold-400">{formatMoney(settleTotalCents)}</span>
                  </div>

                  <div className="space-y-2">
                    {lines.map((line, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <select
                          value={line.method}
                          onChange={(e) => handleLineChange(idx, { method: e.target.value as SettleLine['method'] })}
                          className="h-10 rounded-md border border-input bg-background px-2 text-sm"
                        >
                          <option value="cash">{t('tabs.cash')}</option>
                          <option value="card">{t('tabs.card')}</option>
                          <option value="wallet">{t('tabs.wallet')}</option>
                        </select>
                        <Input
                          type="number"
                          min={0}
                          step="0.01"
                          value={line.amount}
                          onChange={(e) => handleLineChange(idx, { amount: e.target.value })}
                          placeholder="0.00"
                          className="h-10 font-mono tabular-nums"
                        />
                        {lines.length > 1 && (
                          <Button variant="ghost" size="icon" onClick={() => handleRemoveLine(idx)}>
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    ))}
                    <Button variant="outline" size="sm" onClick={handleAddLine}>
                      + {t('tabs.splitPayment')}
                    </Button>
                  </div>

                  <div className="flex justify-between text-sm rounded-lg border border-border/60 p-3">
                    <span className="text-muted-foreground">
                      {remainingCents > 0 ? t('tabs.remaining') : t('tabs.changeDue')}
                    </span>
                    <span
                      className={`font-mono tabular-nums font-semibold ${remainingCents > 0 ? 'text-rose-400' : 'text-emerald-400'}`}
                    >
                      {formatMoney(Math.abs(remainingCents))}
                    </span>
                  </div>

                  <Button
                    variant="gold"
                    size="lg"
                    className="w-full"
                    disabled={settlePending || paidSoFarCents < settleTotalCents}
                    onClick={handleSettle}
                  >
                    {settlePending && <Loader2 className="h-4 w-4 animate-spin" />}
                    {t('tabs.settle')}
                  </Button>
                </>
              ) : (
                <div className="space-y-3">
                  {settleResult.changeCents > 0 && (
                    <div className="rounded-lg bg-emerald-500/10 p-3 text-center">
                      <div className="text-xs text-muted-foreground">{t('tabs.changeDue')}</div>
                      <div className="text-2xl font-bold font-mono tabular-nums text-emerald-400">
                        {formatMoney(settleResult.changeCents)}
                      </div>
                    </div>
                  )}
                  <p className="text-sm text-muted-foreground">
                    {settleResult.invoiceId ? t('tabs.invoiceIssued') : t('tabs.invoiceFailed')}
                  </p>
                  <Button variant="gold" size="lg" className="w-full" onClick={() => setSettleTabId(null)}>
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
