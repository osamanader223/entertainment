import type { InvoiceRow, InvoicePaymentBreakdownLine } from '@/lib/invoices';
import type { getServerDict } from '@/i18n/server';
import { formatMoney } from '@/lib/utils';
import { PrintButton } from './print-button';

// getServerDict()'s `d` is a union of the en/ar dictionary objects (each
// with distinct string-literal value types), not the `Dictionary` alias
// (which pins to the `en` shape specifically) — so props flowing an actual
// runtime dict (which may be the `ar` variant) must be typed off this, not
// off `Dictionary` directly, or an `ar` dict fails to type-check as a prop.
type Dict = Awaited<ReturnType<typeof getServerDict>>['d'];

interface InvoiceDocumentProps {
  invoice: InvoiceRow;
  qrDataUrl: string;
  d: Dict;
  locale: 'ar' | 'en';
  correctedByLabel?: string; // e.g. "Invoice #12"
  paymentBreakdown?: InvoicePaymentBreakdownLine[];
}

const METHOD_LABEL: Record<InvoicePaymentBreakdownLine['method'], { en: string; ar: string }> = {
  cash: { en: 'Cash', ar: 'نقداً' },
  card: { en: 'Card', ar: 'بطاقة' },
  wallet: { en: 'Wallet', ar: 'المحفظة' },
  mada: { en: 'Card (Mada)', ar: 'بطاقة (مدى)' },
  visa: { en: 'Card (Visa)', ar: 'بطاقة (فيزا)' },
  mastercard: { en: 'Card (Mastercard)', ar: 'بطاقة (ماستركارد)' },
  apple_pay: { en: 'Apple Pay', ar: 'أبل باي' },
  stc_pay: { en: 'STC Pay', ar: 'إس تي سي باي' },
};

const TYPE_TITLE_KEY: Record<InvoiceRow['invoice_type'], keyof Dict['invoices']> = {
  simplified: 'simplifiedTaxInvoice',
  standard: 'standardTaxInvoice',
  credit_note: 'creditNote',
  debit_note: 'debitNote',
};

/**
 * The actual document a customer receives — Arabic primary (per ZATCA),
 * English secondary, every required Phase 1 field, and the scannable QR.
 * Deliberately plain, high-contrast, print-friendly markup (not the neon
 * app chrome) — this is a paper/PDF artifact, not an app screen.
 */
export function InvoiceDocument({ invoice, qrDataUrl, d, locale, correctedByLabel, paymentBreakdown }: InvoiceDocumentProps) {
  const title = d.invoices[TYPE_TITLE_KEY[invoice.invoice_type]];
  const issuedDate = new Date(invoice.issued_at);
  const dateLabel = new Intl.DateTimeFormat(locale === 'ar' ? 'ar-SA-u-nu-latn' : 'en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Riyadh',
  }).format(issuedDate);

  return (
    <div dir="rtl" className="bg-white text-black rounded-xl border border-gray-300 p-8 print:border-0 print:rounded-none max-w-2xl mx-auto">
      <div className="flex items-start justify-between gap-4 pb-4 border-b border-gray-300">
        <div>
          <div className="text-2xl font-extrabold">{title}</div>
          <div className="text-sm text-gray-500 mt-1" dir="ltr">
            {invoice.invoice_type === 'simplified' ? 'Simplified Tax Invoice' : invoice.invoice_type === 'standard' ? 'Tax Invoice' : invoice.invoice_type === 'credit_note' ? 'Credit Note' : 'Debit Note'}
          </div>
        </div>
        <div className="text-end shrink-0">
          <div className="text-sm text-gray-500">{d.invoices.invoiceNumber}</div>
          <div className="text-xl font-mono font-bold" dir="ltr">#{invoice.invoice_number}</div>
        </div>
      </div>

      {invoice.corrects_invoice_id && (
        <div className="mt-4 rounded-lg bg-amber-50 border border-amber-300 px-4 py-2 text-sm text-amber-800">
          {d.invoices.correctsInvoice.replace('{number}', correctedByLabel ?? invoice.corrects_invoice_id)}
        </div>
      )}

      <div className="grid grid-cols-2 gap-6 mt-6">
        <div>
          <div className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">{d.invoices.seller}</div>
          <div className="font-bold">{invoice.seller_name}</div>
          <div className="text-sm text-gray-600 mt-0.5" dir="ltr">{d.invoices.vatNumber}: {invoice.seller_vat_number}</div>
          {invoice.seller_address && <div className="text-sm text-gray-600 mt-0.5">{invoice.seller_address}</div>}
        </div>
        <div>
          <div className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">{d.invoices.buyer}</div>
          {invoice.buyer_name ? (
            <>
              <div className="font-bold">{invoice.buyer_name}</div>
              {invoice.buyer_vat_number && (
                <div className="text-sm text-gray-600 mt-0.5" dir="ltr">{d.invoices.vatNumber}: {invoice.buyer_vat_number}</div>
              )}
            </>
          ) : (
            <div className="text-sm text-gray-400">—</div>
          )}
          <div className="text-sm text-gray-600 mt-2">{d.invoices.date}: <span dir="ltr">{dateLabel}</span></div>
        </div>
      </div>

      <table className="w-full mt-6 text-sm border-collapse">
        <thead>
          <tr className="border-b-2 border-gray-300 text-start">
            <th className="py-2 text-start font-bold">{d.invoices.description}</th>
            <th className="py-2 text-center font-bold">{d.invoices.qty}</th>
            <th className="py-2 text-end font-bold">{d.invoices.unitPrice}</th>
            <th className="py-2 text-end font-bold">{d.invoices.vatAmount}</th>
            <th className="py-2 text-end font-bold">{d.invoices.lineTotal}</th>
          </tr>
        </thead>
        <tbody>
          {invoice.line_items.map((item, i) => (
            <tr key={i} className="border-b border-gray-200">
              <td className="py-2">{locale === 'ar' ? item.description_ar : item.description_en}</td>
              <td className="py-2 text-center tabular-nums">{item.qty}</td>
              <td className="py-2 text-end tabular-nums" dir="ltr">{formatMoney(item.unit_price_cents)}</td>
              <td className="py-2 text-end tabular-nums" dir="ltr">{formatMoney(item.vat_cents)}</td>
              <td className="py-2 text-end tabular-nums font-semibold" dir="ltr">{formatMoney(item.total_cents)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="flex justify-end mt-4">
        <div className="w-full max-w-xs space-y-1.5">
          <div className="flex justify-between text-sm text-gray-600">
            <span>{d.invoices.subtotal}</span>
            <span className="tabular-nums" dir="ltr">{formatMoney(invoice.subtotal_cents)}</span>
          </div>
          <div className="flex justify-between text-sm text-gray-600">
            <span>{d.invoices.vatLabel}</span>
            <span className="tabular-nums" dir="ltr">{formatMoney(invoice.vat_amount_cents)}</span>
          </div>
          <div className="flex justify-between text-base font-bold pt-1.5 border-t border-gray-300">
            <span>{d.invoices.total}</span>
            <span className="tabular-nums" dir="ltr">{formatMoney(invoice.total_cents)}</span>
          </div>
        </div>
      </div>

      {paymentBreakdown && paymentBreakdown.length > 0 && (
        <div className="mt-4 rounded-lg bg-gray-50 border border-gray-200 px-4 py-3">
          <div className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">{d.invoices.paidVia}</div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {paymentBreakdown.map((line, i) => (
              <span key={i} dir="ltr">
                {locale === 'ar' ? METHOD_LABEL[line.method].ar : METHOD_LABEL[line.method].en}: {formatMoney(line.amountCents)}
                {line.cardReference ? ` (${line.cardReference})` : ''}
              </span>
            ))}
            <span className="font-semibold" dir="ltr">
              {d.invoices.total}: {formatMoney(invoice.total_cents)}
            </span>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between mt-8 pt-6 border-t border-gray-300">
        <div>
          <div className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">{d.invoices.qrCode}</div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qrDataUrl} alt="ZATCA QR" width={140} height={140} />
        </div>
        <div className="print:hidden">
          <PrintButton label={d.invoices.print} />
        </div>
      </div>
    </div>
  );
}
