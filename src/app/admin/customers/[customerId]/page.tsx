import { requireAuth, userHasAnyRole } from '@/lib/auth';
import { redirect, notFound } from 'next/navigation';
import { getCustomerDetail, listCustomerNotes } from '@/lib/customers';
import { CustomerDetail } from '@/components/admin/customer-detail';

export const metadata = { title: 'Admin — Customer' };
export const dynamic = 'force-dynamic';

const DEMO_TENANT_ID = '11111111-1111-1111-1111-111111111111';
const CRM_ROLES = ['staff', 'manager', 'tenant_admin'] as const;

export default async function AdminCustomerDetailPage({
  params,
}: {
  params: Promise<{ customerId: string }>;
}) {
  const ctx = await requireAuth('/login');
  if (!userHasAnyRole(ctx, [...CRM_ROLES]) && !ctx.isSuperAdmin) redirect('/dashboard');

  const { customerId } = await params;

  let detail;
  try {
    detail = await getCustomerDetail(DEMO_TENANT_ID, customerId);
  } catch {
    notFound();
  }
  const notes = await listCustomerNotes(DEMO_TENANT_ID, customerId);

  return (
    <div className="space-y-6">
      <CustomerDetail customerId={customerId} initialDetail={detail} initialNotes={notes} />
    </div>
  );
}
