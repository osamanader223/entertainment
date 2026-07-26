import { notFound, redirect } from 'next/navigation';
import QRCode from 'qrcode';
import { requireAuth, userHasAnyRole } from '@/lib/auth';
import { getInvoiceById, getInvoicePaymentBreakdown } from '@/lib/invoices';
import { getServerDict } from '@/i18n/server';
import { ThermalReceipt } from '@/components/invoices/thermal-receipt';
import { ReceiptAutoPrint } from '@/components/invoices/receipt-auto-print';
import { PrintButton } from '@/components/invoices/print-button';

export const metadata = { title: 'Receipt' };
export const dynamic = 'force-dynamic';

const DEMO_TENANT_ID = '11111111-1111-1111-1111-111111111111';
const STAFF_ROLES = ['staff', 'manager', 'tenant_admin'] as const;

export default async function ReceiptPage({ params }: { params: Promise<{ invoiceId: string }> }) {
  const { invoiceId } = await params;
  const ctx = await requireAuth('/login');
  if (!userHasAnyRole(ctx, [...STAFF_ROLES]) && !ctx.isSuperAdmin) redirect('/dashboard');

  const { d, locale } = await getServerDict();
  const invoice = await getInvoiceById(invoiceId, DEMO_TENANT_ID);
  if (!invoice) notFound();

  const [qrDataUrl, paymentBreakdown] = await Promise.all([
    QRCode.toDataURL(invoice.qr_tlv_base64, { margin: 1, width: 240 }),
    getInvoicePaymentBreakdown(invoice),
  ]);

  return (
    <div style={{ background: '#e5e5e5', minHeight: '100vh', padding: '16px 0' }}>
      <div className="print:hidden" style={{ maxWidth: 302, margin: '0 auto 12px', textAlign: 'center' }}>
        <PrintButton label={d.pos.printReceipt} />
      </div>
      <ThermalReceipt invoice={invoice} qrDataUrl={qrDataUrl} d={d} locale={locale} paymentBreakdown={paymentBreakdown} />
      <ReceiptAutoPrint />
    </div>
  );
}
