'use client';

import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Loader2, Eye, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useT } from '@/i18n/context';
import { formatMoney } from '@/lib/utils';
import type { InvoiceRow, UninvoicedPayment } from '@/lib/invoices';
import { retryInvoiceIssuanceAction, issueCreditNoteAction, listInvoicesAction, listUninvoicedPaymentsAction } from '@/app/admin/invoices/actions';

interface InvoicesManagerProps {
  initialInvoices: InvoiceRow[];
  initialUninvoiced: UninvoicedPayment[];
}

const TYPE_OPTIONS = ['standard', 'simplified', 'credit_note', 'debit_note'] as const;

export function InvoicesManager({ initialInvoices, initialUninvoiced }: InvoicesManagerProps) {
  const { t, locale } = useT();
  const [invoices, setInvoices] = useState(initialInvoices);
  const [uninvoiced, setUninvoiced] = useState(initialUninvoiced);
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [pending, startTransition] = useTransition();
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [creditNoteId, setCreditNoteId] = useState<string | null>(null);

  const refreshInvoices = () => {
    startTransition(async () => {
      const res = await listInvoicesAction();
      if (res.ok) setInvoices(res.invoices);
    });
  };

  const refreshUninvoiced = () => {
    startTransition(async () => {
      const res = await listUninvoicedPaymentsAction();
      if (res.ok) setUninvoiced(res.payments);
    });
  };

  const filtered = useMemo(() => {
    return invoices.filter((inv) => {
      if (typeFilter !== 'all' && inv.invoice_type !== typeFilter) return false;
      const issuedDate = inv.issued_at.slice(0, 10);
      if (dateFrom && issuedDate < dateFrom) return false;
      if (dateTo && issuedDate > dateTo) return false;
      return true;
    });
  }, [invoices, typeFilter, dateFrom, dateTo]);

  const handleRetry = (payment: UninvoicedPayment) => {
    setRetryingId(payment.paymentId);
    startTransition(async () => {
      const res = await retryInvoiceIssuanceAction({ paymentId: payment.paymentId, sessionId: payment.sessionId ?? undefined });
      setRetryingId(null);
      if (res.ok) {
        toast.success(t('invoices.retrySuccess'));
        refreshInvoices();
        refreshUninvoiced();
      } else {
        toast.error(`${t('invoices.retryFailed')} (${res.error})`);
      }
    });
  };

  const handleCreditNote = (invoice: InvoiceRow) => {
    if (!window.confirm(t('invoices.issueCreditNoteConfirm').replace('{number}', String(invoice.invoice_number)))) return;
    setCreditNoteId(invoice.id);
    startTransition(async () => {
      const res = await issueCreditNoteAction({ invoiceId: invoice.id });
      setCreditNoteId(null);
      if (res.ok) {
        toast.success(t('invoices.creditNoteIssued'));
        refreshInvoices();
      } else {
        toast.error(res.error);
      }
    });
  };

  return (
    <div className="space-y-8">
      {/* Uninvoiced payments — the retry surface */}
      <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 overflow-hidden">
        <div className="px-4 py-3 border-b border-amber-500/20">
          <div className="font-semibold text-amber-400">{t('invoices.uninvoicedTitle')}</div>
          <p className="text-xs text-muted-foreground mt-0.5">{t('invoices.uninvoicedSubtitle')}</p>
        </div>
        {uninvoiced.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">{t('invoices.noUninvoiced')}</p>
        ) : (
          <table className="w-full text-sm">
            <tbody className="divide-y divide-border/40">
              {uninvoiced.map((p) => (
                <tr key={p.paymentId}>
                  <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">{p.paymentId.slice(0, 8)}…</td>
                  <td className="px-4 py-2.5 tabular-nums">{formatMoney(p.amountCents)}</td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">{p.capturedAt ? new Date(p.capturedAt).toLocaleString() : '—'}</td>
                  <td className="px-4 py-2.5 text-end">
                    <Button size="sm" variant="outline" disabled={pending && retryingId === p.paymentId} onClick={() => handleRetry(p)}>
                      {retryingId === p.paymentId && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                      {t('invoices.retry')}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <label className="text-xs text-muted-foreground">{t('invoices.filterType')}</label>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="all">{t('invoices.filterAll')}</option>
            {TYPE_OPTIONS.map((type) => (
              <option key={type} value={type}>
                {t(`invoices.${type === 'standard' ? 'standardTaxInvoice' : type === 'simplified' ? 'simplifiedTaxInvoice' : type === 'credit_note' ? 'creditNote' : 'debitNote'}`)}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <label className="text-xs text-muted-foreground">{t('invoices.dateFrom')}</label>
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-10 rounded-md border border-input bg-background px-3 text-sm font-mono" dir="ltr" />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs text-muted-foreground">{t('invoices.dateTo')}</label>
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="h-10 rounded-md border border-input bg-background px-3 text-sm font-mono" dir="ltr" />
        </div>
      </div>

      {/* Invoices table */}
      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">{t('invoices.noInvoices')}</p>
      ) : (
        <div className="rounded-xl border border-border/60 overflow-hidden overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 text-muted-foreground text-xs uppercase tracking-wide">
              <tr>
                <th className="px-4 py-3 text-start">{t('invoices.invoiceNumber')}</th>
                <th className="px-4 py-3 text-start">{t('invoices.filterType')}</th>
                <th className="px-4 py-3 text-start">{t('invoices.date')}</th>
                <th className="px-4 py-3 text-start">{t('invoices.buyer')}</th>
                <th className="px-4 py-3 text-end">{t('invoices.total')}</th>
                <th className="px-4 py-3 text-end">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {filtered.map((inv) => (
                <tr key={inv.id} className="hover:bg-muted/10 transition-colors">
                  <td className="px-4 py-3 font-mono font-semibold">#{inv.invoice_number}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {t(`invoices.${inv.invoice_type === 'standard' ? 'standardTaxInvoice' : inv.invoice_type === 'simplified' ? 'simplifiedTaxInvoice' : inv.invoice_type === 'credit_note' ? 'creditNote' : 'debitNote'}`)}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{new Date(inv.issued_at).toLocaleString(locale === 'ar' ? 'ar-SA' : 'en-US')}</td>
                  <td className="px-4 py-3 text-muted-foreground">{inv.buyer_name ?? '—'}</td>
                  <td className="px-4 py-3 text-end font-semibold text-gold-400 tabular-nums">{formatMoney(inv.total_cents)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1.5">
                      <Link href={`/invoices/${inv.id}`} target="_blank">
                        <Button variant="ghost" size="icon" title={t('invoices.view')}>
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                      </Link>
                      {(inv.invoice_type === 'standard' || inv.invoice_type === 'simplified') && (
                        <Button
                          variant="ghost"
                          size="icon"
                          title={t('invoices.issueCreditNote')}
                          disabled={pending && creditNoteId === inv.id}
                          onClick={() => handleCreditNote(inv)}
                        >
                          {creditNoteId === inv.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Undo2 className="h-3.5 w-3.5" />}
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
