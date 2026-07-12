import { requireRole } from '@/lib/auth';
import { resolveBranchByCode, getPublicVenueState } from '@/lib/venue';
import { getReservationBoard } from '@/lib/cashier-reservations';
import { CashierFlow } from '@/components/cashier/cashier-flow';
import { CashierPageHeader } from '@/components/cashier/cashier-page-header';

export const metadata = { title: 'Cashier' };
export const dynamic = 'force-dynamic';

const DEMO_TENANT_ID = '11111111-1111-1111-1111-111111111111';
const DEMO_BRANCH_CODE = 'JED-01';
const STAFF_ROLES = ['staff', 'manager', 'tenant_admin'] as const;

export default async function CashierPage() {
  await requireRole(DEMO_TENANT_ID, [...STAFF_ROLES]);

  const branchId = await resolveBranchByCode(DEMO_BRANCH_CODE);
  if (!branchId) {
    return (
      <div className="rounded-xl border border-rose-500/30 bg-rose-500/5 p-6 text-rose-300">
        Branch not found or inactive.
      </div>
    );
  }

  const [initialState, reservations] = await Promise.all([
    getPublicVenueState(branchId),
    getReservationBoard(DEMO_TENANT_ID, branchId),
  ]);
  const upcomingReservationsCount = reservations.filter((r) => r.status !== 'in_session').length;

  return (
    <div className="space-y-6">
      <CashierPageHeader upcomingReservationsCount={upcomingReservationsCount} />
      <CashierFlow branchId={branchId} branchCode={DEMO_BRANCH_CODE} initial={initialState ?? undefined} />
    </div>
  );
}
