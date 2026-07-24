import { requireAuth, userHasAnyRole } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { listInvoices, listUninvoicedPayments } from '@/lib/invoices';
import { getServerDict } from '@/i18n/server';
import { InvoicesManager } from '@/components/admin/invoices-manager';

export const metadata = { title: 'Admin — Invoices' };
export const dynamic = 'force-dynamic';

const DEMO_TENANT_ID = '11111111-1111-1111-1111-111111111111';
const DEMO_BRANCH_ID = '22222222-2222-2222-2222-222222222222';
const ADMIN_ROLES = ['manager', 'tenant_admin'] as const;

export default async function AdminInvoicesPage() {
  const ctx = await requireAuth('/login');
  if (!userHasAnyRole(ctx, [...ADMIN_ROLES]) && !ctx.isSuperAdmin) redirect('/dashboard');

  const { d } = await getServerDict();

  const [invoices, uninvoiced] = await Promise.all([
    listInvoices(DEMO_TENANT_ID),
    listUninvoicedPayments(DEMO_TENANT_ID, DEMO_BRANCH_ID),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">{d.invoices.listTitle}</h1>
        <p className="text-muted-foreground mt-1">{d.invoices.listSubtitle}</p>
      </div>
      <InvoicesManager initialInvoices={invoices} initialUninvoiced={uninvoiced} />
    </div>
  );
}
