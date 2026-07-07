import { requireAuth, userHasAnyRole } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { getServerDict } from '@/i18n/server';
import { listCustomers } from '@/lib/customers';
import { CustomersList } from '@/components/admin/customers-list';

export const metadata = { title: 'Admin — Customers' };
export const dynamic = 'force-dynamic';

const DEMO_TENANT_ID = '11111111-1111-1111-1111-111111111111';
// Staff can see customers (they serve them) — unlike offers/pricing which are manager+.
const CRM_ROLES = ['staff', 'manager', 'tenant_admin'] as const;

export default async function AdminCustomersPage() {
  const ctx = await requireAuth('/login');
  if (!userHasAnyRole(ctx, [...CRM_ROLES]) && !ctx.isSuperAdmin) redirect('/dashboard');

  const { d } = await getServerDict();
  const initialData = await listCustomers({ tenantId: DEMO_TENANT_ID, page: 1 });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">{d.adminCustomers.title}</h1>
        <p className="text-muted-foreground mt-1">{d.adminCustomers.subtitle}</p>
      </div>
      <CustomersList initialData={initialData} />
    </div>
  );
}
