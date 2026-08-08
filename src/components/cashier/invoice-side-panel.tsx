'use client';

import { useEffect, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Receipt, Printer } from 'lucide-react';
import { useT } from '@/i18n/context';
import { dictionaries } from '@/i18n/dictionaries';
import { InvoiceDocument } from '@/components/invoices/invoice-document';
import { getInvoiceForReceiptAction } from '@/app/(dashboard)/dashboard/cashier/actions';
import type { InvoiceRow, InvoicePaymentBreakdownLine } from '@/lib/invoices';

interface InvoiceSidePanelProps {
  invoiceId: string | null;
}

/**
 * The invoice for whatever was just settled (or picked from history), shown
 * live on the same screen instead of opening `/invoices/[id]` in a new tab.
 * Reuses InvoiceDocument as-is — it's already a plain, presentational,
 * print-friendly component with no server-only imports, so it drops
 * straight into this client tree.
 */
export function InvoiceSidePanel({ invoiceId }: InvoiceSidePanelProps) {
  const { t, locale } = useT();
  const [data, setData] = useState<{ invoice: InvoiceRow; paymentBreakdown: InvoicePaymentBreakdownLine[]; qrDataUrl: string } | null>(null);
  const [pending, startPending] = useTransition();

  useEffect(() => {
    if (!invoiceId) {
      setData(null);
      return;
    }
    startPending(async () => {
      const res = await getInvoiceForReceiptAction({ invoiceId });
      if (res.error || !res.invoice || !res.qrDataUrl) {
        toast.error(res.error ?? t('pos.noInvoiceToReprint'));
        return;
      }
      setData({ invoice: res.invoice, paymentBreakdown: res.paymentBreakdown ?? [], qrDataUrl: res.qrDataUrl });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoiceId]);

  return (
    <Card className="xl:sticky xl:top-4 h-fit">
      <CardHeader className="flex-row items-center gap-2 space-y-0">
        <Receipt className="h-4 w-4 text-gold-400" />
        <CardTitle className="text-lg">{t('pos.invoice')}</CardTitle>
      </CardHeader>
      <CardContent>
        {pending ? (
          <div className="flex items-center justify-center py-10 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : !data ? (
          <div className="text-sm text-muted-foreground text-center py-10">{t('pos.noInvoiceYet')}</div>
        ) : (
          <div className="space-y-3">
            <div className="max-h-[70vh] overflow-y-auto rounded-lg">
              <InvoiceDocument
                invoice={data.invoice}
                qrDataUrl={data.qrDataUrl}
                d={dictionaries[locale]}
                locale={locale}
                paymentBreakdown={data.paymentBreakdown}
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => window.open(`/invoices/${data.invoice.id}/receipt`, '_blank')}
            >
              <Printer className="h-3.5 w-3.5" />
              {t('pos.reprintLastInvoice')}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
