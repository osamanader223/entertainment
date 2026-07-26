'use client';

import { useEffect, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Search, Eye, Printer, Undo2, X } from 'lucide-react';
import { formatMoney } from '@/lib/utils';
import { useT } from '@/i18n/context';
import { searchInvoicesAction, issueCreditNoteFromCashierAction } from '@/app/(dashboard)/dashboard/cashier/actions';

export interface InvoiceSearchResult {
  id: string;
  invoiceNumber: number;
  invoiceType: 'standard' | 'simplified' | 'credit_note' | 'debit_note';
  totalCents: number;
  issuedAt: string;
  customerName: string | null;
  customerPhone: string | null;
}

interface InvoiceHistoryPanelProps {
  branchId: string;
  shiftId: string | null;
  open: boolean;
  onClose: () => void;
}

export function InvoiceHistoryPanel({ branchId, shiftId, open, onClose }: InvoiceHistoryPanelProps) {
  const { t } = useT();
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState<'shift' | 'all'>('shift');
  const [results, setResults] = useState<InvoiceSearchResult[]>([]);
  const [pending, startPending] = useTransition();

  const runSearch = () => {
    startPending(async () => {
      const res = await searchInvoicesAction({
        branchId,
        query: query.trim() || undefined,
        shiftId: scope === 'shift' ? (shiftId ?? undefined) : undefined,
      });
      if (res.error) {
        toast.error(res.error);
        return;
      }
      setResults(res.invoices ?? []);
    });
  };

  useEffect(() => {
    if (open) runSearch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, scope, shiftId]);

  const handleRefund = (invoice: InvoiceSearchResult) => {
    if (!window.confirm(t('pos.refundReturnConfirm', { number: String(invoice.invoiceNumber) }))) return;
    startPending(async () => {
      const res = await issueCreditNoteFromCashierAction({ invoiceId: invoice.id });
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success(t('pos.creditNoteIssued'));
      runSearch();
    });
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <Card className="w-full max-w-2xl glass border-gold-500/30 max-h-[85vh] overflow-y-auto">
        <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
          <CardTitle className="text-lg">{t('pos.invoiceHistory')}</CardTitle>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute start-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && runSearch()}
                placeholder={t('pos.searchInvoicePlaceholder')}
                className="h-10 ps-9"
              />
            </div>
            <Button variant="outline" size="sm" onClick={runSearch} disabled={pending}>
              {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : t('pos.invoiceSearch')}
            </Button>
          </div>

          <div className="flex gap-2">
            <Button variant={scope === 'shift' ? 'gold' : 'outline'} size="sm" onClick={() => setScope('shift')} disabled={!shiftId}>
              {t('pos.thisShiftOnly')}
            </Button>
            <Button variant={scope === 'all' ? 'gold' : 'outline'} size="sm" onClick={() => setScope('all')}>
              {t('pos.allInvoices')}
            </Button>
          </div>

          {results.length === 0 ? (
            <div className="text-sm text-muted-foreground text-center py-6">{t('pos.noInvoicesFound')}</div>
          ) : (
            <div className="space-y-1.5">
              {results.map((inv) => (
                <div key={inv.id} className="flex items-center justify-between gap-3 rounded-lg border border-border/60 p-3 text-sm">
                  <div>
                    <div className="font-mono font-semibold">#{inv.invoiceNumber}</div>
                    <div className="text-xs text-muted-foreground">
                      {inv.customerName || inv.customerPhone || '—'} · {new Date(inv.issuedAt).toLocaleString()}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono tabular-nums font-semibold">{formatMoney(inv.totalCents)}</span>
                    <a href={`/invoices/${inv.id}`} target="_blank" rel="noreferrer">
                      <Button variant="ghost" size="icon" title={t('invoices.view')}>
                        <Eye className="h-3.5 w-3.5" />
                      </Button>
                    </a>
                    <Button
                      variant="ghost"
                      size="icon"
                      title={t('pos.printReceipt')}
                      onClick={() => window.open(`/invoices/${inv.id}/receipt`, '_blank')}
                    >
                      <Printer className="h-3.5 w-3.5" />
                    </Button>
                    {(inv.invoiceType === 'standard' || inv.invoiceType === 'simplified') && (
                      <Button variant="ghost" size="icon" title={t('pos.refundReturn')} onClick={() => handleRefund(inv)}>
                        <Undo2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
