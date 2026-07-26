import type { InvoiceRow, InvoicePaymentBreakdownLine } from '@/lib/invoices';
import type { getServerDict } from '@/i18n/server';
import { formatMoney } from '@/lib/utils';

type Dict = Awaited<ReturnType<typeof getServerDict>>['d'];

interface ThermalReceiptProps {
  invoice: InvoiceRow;
  qrDataUrl: string;
  d: Dict;
  locale: 'ar' | 'en';
  paymentBreakdown: InvoicePaymentBreakdownLine[];
}

const METHOD_LABEL: Record<InvoicePaymentBreakdownLine['method'], { en: string; ar: string }> = {
  cash: { en: 'Cash', ar: 'نقداً' },
  card: { en: 'Card', ar: 'بطاقة' },
  wallet: { en: 'Wallet', ar: 'المحفظة' },
  mada: { en: 'Mada', ar: 'مدى' },
  visa: { en: 'Visa', ar: 'فيزا' },
  mastercard: { en: 'Mastercard', ar: 'ماستركارد' },
  apple_pay: { en: 'Apple Pay', ar: 'أبل باي' },
  stc_pay: { en: 'STC Pay', ar: 'إس تي سي باي' },
};

/**
 * The ONE place in this app that ignores the neon theme entirely — an
 * 80mm thermal printer is black-on-white, no gradients, no color. Meant to
 * be the only visible content on its page (see
 * /invoices/[invoiceId]/receipt) so `@media print { @page }` can size the
 * whole page to the roll, with no "hide everything else" trick needed.
 */
export function ThermalReceipt({ invoice, qrDataUrl, d, locale, paymentBreakdown }: ThermalReceiptProps) {
  const issuedDate = new Date(invoice.issued_at);
  const dateLabel = new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Riyadh',
  }).format(issuedDate);
  const discountLine = invoice.line_items.find((li) => li.total_cents < 0);
  const soldLines = invoice.line_items.filter((li) => li.total_cents >= 0);

  return (
    <>
      <style>{`
        @media print {
          @page { size: 80mm auto; margin: 0; }
          html, body { margin: 0; padding: 0; }
        }
        .receipt-80mm {
          width: 302px; /* ~80mm at 96dpi */
          max-width: 100%;
          margin: 0 auto;
          background: #fff;
          color: #000;
          font-family: 'Courier New', ui-monospace, monospace;
          font-size: 11px;
          line-height: 1.4;
          padding: 8px 6px;
        }
        .receipt-80mm hr { border: none; border-top: 1px dashed #000; margin: 6px 0; }
        .receipt-80mm .center { text-align: center; }
        .receipt-80mm .row { display: flex; justify-content: space-between; gap: 6px; }
        .receipt-80mm .bold { font-weight: 700; }
        .receipt-80mm .small { font-size: 9px; color: #333; }
      `}</style>
      <div className="receipt-80mm" dir="rtl">
        <div className="center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/images/bolos-logo.png"
            alt="Bolos Alley"
            width={64}
            height={64}
            style={{ margin: '0 auto', filter: 'grayscale(1) contrast(1.4)' }}
          />
          <div className="bold" style={{ fontSize: 13, marginTop: 4 }}>
            {invoice.seller_name}
          </div>
          <div dir="ltr" className="small">
            {d.invoices.vatNumber}: {invoice.seller_vat_number}
          </div>
          {invoice.seller_address && <div className="small">{invoice.seller_address}</div>}
        </div>

        <hr />
        <div className="center bold">
          {invoice.invoice_type === 'standard' ? 'فاتورة ضريبية / Tax Invoice' : 'فاتورة ضريبية مبسطة / Simplified Tax Invoice'}
        </div>
        <hr />

        <div className="row">
          <span>{d.invoices.invoiceNumber}</span>
          <span dir="ltr" className="bold">#{invoice.invoice_number}</span>
        </div>
        <div className="row">
          <span>{d.invoices.date}</span>
          <span dir="ltr">{dateLabel}</span>
        </div>
        {invoice.buyer_name && (
          <div className="row">
            <span>{d.invoices.buyer}</span>
            <span>{invoice.buyer_name}</span>
          </div>
        )}

        <hr />
        {soldLines.map((item, i) => (
          <div key={i} style={{ marginBottom: 3 }}>
            <div>{locale === 'ar' ? item.description_ar : item.description_en}</div>
            <div className="row small">
              <span>
                {item.qty} × <span dir="ltr">{formatMoney(item.unit_price_cents + Math.round(item.vat_cents / item.qty))}</span>
              </span>
              <span dir="ltr" className="bold">{formatMoney(item.total_cents)}</span>
            </div>
          </div>
        ))}

        {discountLine && (
          <div className="row">
            <span>{d.pos.discount}</span>
            <span dir="ltr">−{formatMoney(Math.abs(discountLine.total_cents))}</span>
          </div>
        )}

        <hr />
        <div className="row">
          <span>{d.invoices.subtotal}</span>
          <span dir="ltr">{formatMoney(invoice.subtotal_cents)}</span>
        </div>
        <div className="row">
          <span>{d.invoices.vatLabel}</span>
          <span dir="ltr">{formatMoney(invoice.vat_amount_cents)}</span>
        </div>
        <div className="row bold" style={{ fontSize: 13 }}>
          <span>{d.invoices.total}</span>
          <span dir="ltr">{formatMoney(invoice.total_cents)}</span>
        </div>

        {paymentBreakdown.length > 0 && (
          <>
            <hr />
            <div className="small bold">{d.invoices.paidVia}</div>
            {paymentBreakdown.map((line, i) => (
              <div key={i} className="row small">
                <span>
                  {locale === 'ar' ? METHOD_LABEL[line.method].ar : METHOD_LABEL[line.method].en}
                  {line.cardReference ? ` (${line.cardReference})` : ''}
                </span>
                <span dir="ltr">{formatMoney(line.amountCents)}</span>
              </div>
            ))}
          </>
        )}

        <hr />
        <div className="center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qrDataUrl} alt="ZATCA QR" width={120} height={120} style={{ margin: '0 auto' }} />
        </div>

        <div className="center bold" style={{ marginTop: 8 }}>
          {d.pos.thankYou}
        </div>
      </div>
    </>
  );
}
