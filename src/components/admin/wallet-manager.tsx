'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { useT } from '@/i18n/context';
import { formatMoney } from '@/lib/utils';
import type { CustomerSearchResult, CustomerWalletDetail } from '@/lib/wallet-admin';
import {
  searchCustomersAction,
  getCustomerWalletDetailAction,
  adminCreditAction,
  adminDebitAction,
  refundPaymentAction,
} from '@/app/admin/wallet/actions';
import { Search, Loader2, Wallet, AlertTriangle, ArrowDownLeft, ArrowUpRight, X } from 'lucide-react';

const TIER_BADGE: Record<string, string> = {
  silver: 'bg-slate-400/15 text-slate-300 border-slate-400/30',
  gold: 'bg-[#F5C451]/15 text-[#F5C451] border-[#F5C451]/30',
  platinum: 'bg-cyan-400/15 text-cyan-300 border-cyan-400/30',
  diamond: 'bg-violet-400/15 text-violet-300 border-violet-400/30',
  vip: 'bg-violet-400/15 text-violet-300 border-violet-400/30',
};

type ModalKind = { type: 'credit' | 'debit' } | { type: 'refund'; paymentId: string; amountCents: number } | null;

export function WalletManager() {
  const { t } = useT();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<CustomerSearchResult[]>([]);
  const [searching, startSearch] = useTransition();
  const [searched, setSearched] = useState(false);

  const [selected, setSelected] = useState<CustomerSearchResult | null>(null);
  const [detail, setDetail] = useState<CustomerWalletDetail | null>(null);
  const [loadingDetail, startLoadDetail] = useTransition();

  const [modal, setModal] = useState<ModalKind>(null);
  const [amountSar, setAmountSar] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const runSearch = () => {
    if (!query.trim()) return;
    startSearch(async () => {
      const res = await searchCustomersAction(query.trim());
      setSearched(true);
      if (res.ok) setResults(res.customers);
      else { setResults([]); toast.error(res.error); }
    });
  };

  const selectCustomer = (customer: CustomerSearchResult) => {
    setSelected(customer);
    setDetail(null);
    startLoadDetail(async () => {
      const res = await getCustomerWalletDetailAction(customer.customerId);
      if (res.ok) setDetail(res.detail);
      else toast.error(res.error);
    });
  };

  const refreshDetail = () => {
    if (!selected) return;
    startLoadDetail(async () => {
      const res = await getCustomerWalletDetailAction(selected.customerId);
      if (res.ok) setDetail(res.detail);
    });
  };

  const closeModal = () => {
    setModal(null);
    setAmountSar('');
    setReason('');
  };

  const submitModal = async () => {
    if (!modal || !selected) return;
    if (modal.type !== 'refund') {
      const amountCents = Math.round(parseFloat(amountSar) * 100);
      if (!amountCents || amountCents <= 0) { toast.error(t('adminWallet.invalidAmount')); return; }
      if (!reason.trim()) { toast.error(t('adminWallet.reasonRequired')); return; }

      setSubmitting(true);
      const action = modal.type === 'credit' ? adminCreditAction : adminDebitAction;
      const res = await action({ customerId: selected.customerId, amountCents, reason: reason.trim() });
      setSubmitting(false);
      if (!res.ok) { toast.error(res.error); return; }
      toast.success(modal.type === 'credit' ? t('adminWallet.creditSuccess') : t('adminWallet.debitSuccess'));
      closeModal();
      refreshDetail();
    } else {
      if (!reason.trim()) { toast.error(t('adminWallet.reasonRequired')); return; }
      setSubmitting(true);
      const res = await refundPaymentAction({ paymentId: modal.paymentId, reason: reason.trim(), refundToWallet: true });
      setSubmitting(false);
      if (!res.ok) { toast.error(res.error); return; }
      toast.success(t('adminWallet.refundSuccess', { amount: formatMoney(res.refundedCents) }));
      closeModal();
      refreshDetail();
    }
  };

  return (
    <div className="space-y-6">
      {/* Search */}
      <div className="flex gap-2 max-w-lg">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && runSearch()}
          placeholder={t('adminWallet.searchPlaceholder')}
        />
        <Button type="button" variant="gold" disabled={searching || !query.trim()} onClick={runSearch}>
          {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          {t('adminWallet.search')}
        </Button>
      </div>

      {searched && !searching && results.length === 0 && (
        <p className="text-sm text-muted-foreground">{t('adminWallet.noResults')}</p>
      )}

      {results.length > 0 && !selected && (
        <div className="rounded-xl border border-border/60 overflow-hidden max-w-2xl">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 text-muted-foreground text-xs uppercase tracking-wide">
              <tr>
                <th className="px-4 py-2.5 text-start">{t('adminWallet.customer')}</th>
                <th className="px-4 py-2.5 text-start">{t('adminWallet.tier')}</th>
                <th className="px-4 py-2.5 text-end">{t('adminWallet.balance')}</th>
                <th />
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {results.map((c) => (
                <tr key={c.customerId} className="hover:bg-muted/10 transition-colors cursor-pointer" onClick={() => selectCustomer(c)}>
                  <td className="px-4 py-2.5">
                    <div className="font-medium">{c.fullName ?? '—'}</div>
                    <div className="text-xs text-muted-foreground font-mono">{c.phone ?? c.email ?? ''}</div>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase ${TIER_BADGE[c.tier] ?? TIER_BADGE.silver}`}>
                      {c.tier}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-end font-mono">{formatMoney(c.balanceCents)}</td>
                  <td className="px-4 py-2.5 text-end">
                    <Button size="sm" variant="ghost">{t('adminWallet.select')}</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Detail panel */}
      {selected && (
        <div className="space-y-4">
          <button
            type="button"
            className="text-xs text-muted-foreground hover:text-foreground underline"
            onClick={() => { setSelected(null); setDetail(null); }}
          >
            ← {t('adminWallet.backToSearch')}
          </button>

          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <h2 className="text-xl font-bold">{selected.fullName ?? '—'}</h2>
              <p className="text-sm text-muted-foreground font-mono">{selected.phone ?? selected.email ?? ''}</p>
            </div>
            <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold uppercase ${TIER_BADGE[selected.tier] ?? TIER_BADGE.silver}`}>
              {selected.tier}
            </span>
          </div>

          <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-400">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {t('adminWallet.moneyWarning')}
          </div>

          {loadingDetail && !detail ? (
            <p className="text-sm text-muted-foreground py-6 text-center">{t('common.loading')}</p>
          ) : detail ? (
            <>
              <Card className="glass border-gold-500/30">
                <CardContent className="p-6 flex items-center justify-between flex-wrap gap-4">
                  <div>
                    <div className="flex items-center gap-2 text-muted-foreground text-sm">
                      <Wallet className="h-4 w-4 text-gold-400" />
                      {t('adminWallet.currentBalance')}
                    </div>
                    <div className="mt-2 text-3xl font-bold text-gradient-gold font-mono tabular-nums">
                      {formatMoney(detail.balanceCents)}
                    </div>
                    {detail.isFrozen && (
                      <p className="text-xs text-destructive mt-1">{t('adminWallet.walletFrozen')}</p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => setModal({ type: 'credit' })}>
                      {t('adminWallet.creditWallet')}
                    </Button>
                    <Button variant="outline" onClick={() => setModal({ type: 'debit' })}>
                      {t('adminWallet.debitWallet')}
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Ledger */}
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold text-muted-foreground">{t('adminWallet.ledgerTitle')}</h3>
                  {detail.ledger.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-4 text-center">{t('wallet.noTransactions')}</p>
                  ) : (
                    <div className="space-y-1.5 max-h-96 overflow-y-auto">
                      {detail.ledger.map((entry, i) => {
                        const isCredit = entry.deltaCents > 0;
                        return (
                          <div key={i} className="flex items-center justify-between rounded-lg border border-border/60 bg-card/40 px-3 py-2 text-sm">
                            <div className="flex items-center gap-2 min-w-0">
                              {isCredit ? <ArrowDownLeft className="h-3.5 w-3.5 text-emerald-400 shrink-0" /> : <ArrowUpRight className="h-3.5 w-3.5 text-rose-400 shrink-0" />}
                              <div className="min-w-0">
                                <div className="truncate text-xs font-medium">{entry.reason ?? entry.kind}</div>
                                <div className="text-[10px] text-muted-foreground">{new Date(entry.createdAt).toLocaleString('en-US')}</div>
                              </div>
                            </div>
                            <div className={`font-mono text-xs font-semibold shrink-0 ${isCredit ? 'text-emerald-400' : 'text-rose-400'}`}>
                              {isCredit ? '+' : '−'}{formatMoney(Math.abs(entry.deltaCents))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Payments */}
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold text-muted-foreground">{t('adminWallet.paymentsTitle')}</h3>
                  {detail.recentPayments.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-4 text-center">{t('adminWallet.noPayments')}</p>
                  ) : (
                    <div className="space-y-1.5 max-h-96 overflow-y-auto">
                      {detail.recentPayments.map((p) => (
                        <div key={p.id} className="flex items-center justify-between rounded-lg border border-border/60 bg-card/40 px-3 py-2 text-sm">
                          <div className="min-w-0">
                            <div className="text-xs font-medium">{p.purpose} · {p.method ?? '—'}</div>
                            <div className="text-[10px] text-muted-foreground">{new Date(p.createdAt).toLocaleString('en-US')}</div>
                            <div className="text-[10px] text-muted-foreground uppercase">{p.status}{p.refundedAmountCents > 0 ? ` · ${t('adminWallet.refunded')}` : ''}</div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="font-mono text-xs font-semibold">{formatMoney(p.amountCents)}</span>
                            {p.status === 'captured' && p.refundedAmountCents < p.amountCents && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 text-xs text-destructive hover:text-destructive"
                                onClick={() => setModal({ type: 'refund', paymentId: p.id, amountCents: p.amountCents - p.refundedAmountCents })}
                              >
                                {t('adminWallet.refund')}
                              </Button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </>
          ) : null}
        </div>
      )}

      {/* Modal */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <Card className="w-full max-w-sm glass border-gold-500/30">
            <CardContent className="p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">
                  {modal.type === 'credit' && t('adminWallet.creditWallet')}
                  {modal.type === 'debit' && t('adminWallet.debitWallet')}
                  {modal.type === 'refund' && t('adminWallet.refundPayment')}
                </h3>
                <button type="button" onClick={closeModal} className="text-muted-foreground hover:text-foreground">
                  <X className="h-4 w-4" />
                </button>
              </div>

              {modal.type === 'refund' ? (
                <p className="text-sm text-muted-foreground">
                  {t('adminWallet.refundNote', { amount: formatMoney(modal.amountCents) })}
                </p>
              ) : (
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">{t('adminWallet.amountSar')}</Label>
                  <Input
                    type="number"
                    min="1"
                    step="0.01"
                    value={amountSar}
                    onChange={(e) => setAmountSar(e.target.value)}
                    placeholder="0.00"
                    className="font-mono"
                  />
                </div>
              )}

              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">{t('adminWallet.reason')}</Label>
                <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t('adminWallet.reasonPlaceholder')} />
              </div>

              <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-400">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                {t('adminWallet.moneyWarning')}
              </div>

              <div className="flex gap-3">
                <Button variant="gold" className="flex-1" disabled={submitting} onClick={submitModal}>
                  {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                  {t('common.confirm')}
                </Button>
                <Button variant="outline" onClick={closeModal}>{t('common.cancel')}</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
