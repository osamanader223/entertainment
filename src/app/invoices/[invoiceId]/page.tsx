import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import QRCode from 'qrcode';
import { ArrowLeft } from 'lucide-react';
import { requireAuth, userHasAnyRole } from '@/lib/auth';
import { getInvoiceById, getInvoicePaymentBreakdown } from '@/lib/invoices';
import { getServerDict } from '@/i18n/server';
import { InvoiceDocument } from '@/components/invoices/invoice-document';

export const metadata = { title: 'Invoice' };
export const dynamic = 'force-dynamic';

const DEMO_TENANT_ID = '11111111-1111-1111-1111-111111111111';
const STAFF_ROLES = ['staff', 'manager', 'tenant_admin'] as const;

export default async function InvoiceViewPage({ params }: { params: Promise<{ invoiceId: string }> }) {
  const { invoiceId } = await params;
  const ctx = await requireAuth('/login');
  if (!userHasAnyRole(ctx, [...STAFF_ROLES]) && !ctx.isSuperAdmin) redirect('/dashboard');

  const { d, locale } = await getServerDict();
  const invoice = await getInvoiceById(invoiceId, DEMO_TENANT_ID);
  if (!invoice) notFound();

  const qrDataUrl = await QRCode.toDataURL(invoice.qr_tlv_base64, { margin: 1, width: 280 });
  const paymentBreakdown = await getInvoicePaymentBreakdown(invoice);

  let correctedByLabel: string | undefined;
  if (invoice.corrects_invoice_id) {
    const original = await getInvoiceById(invoice.corrects_invoice_id, DEMO_TENANT_ID);
    correctedByLabel = original ? String(original.invoice_number) : undefined;
  }

  return (
    <div className="min-h-screen bg-gray-100 py-10 px-4">
      <div className="max-w-2xl mx-auto mb-4 print:hidden">
        <Link href="/admin/invoices" className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-600 hover:text-gray-900">
          <ArrowLeft className="h-4 w-4 rtl:rotate-180" />
          {d.invoices.backToList}
        </Link>
      </div>
      <InvoiceDocument
        invoice={invoice}
        qrDataUrl={qrDataUrl}
        d={d}
        locale={locale}
        correctedByLabel={correctedByLabel}
        paymentBreakdown={paymentBreakdown}
      />
    </div>
  );
}
