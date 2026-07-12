import { requireRole } from '@/lib/auth';
import { resolveBranchByCode } from '@/lib/venue';
import { getReservationBoard } from '@/lib/cashier-reservations';
import { ReservationBoard } from '@/components/cashier/reservation-board';

export const metadata = { title: 'Reservations' };
export const dynamic = 'force-dynamic';

const DEMO_TENANT_ID = '11111111-1111-1111-1111-111111111111';
const DEMO_BRANCH_ID = '22222222-2222-2222-2222-222222222222';
const DEMO_BRANCH_CODE = 'JED-01';
const STAFF_ROLES = ['staff', 'manager', 'tenant_admin'] as const;

export default async function ReservationsPage() {
  await requireRole(DEMO_TENANT_ID, [...STAFF_ROLES]);

  const branchId = (await resolveBranchByCode(DEMO_BRANCH_CODE)) ?? DEMO_BRANCH_ID;
  const initialReservations = await getReservationBoard(DEMO_TENANT_ID, branchId);

  return <ReservationBoard branchId={branchId} initialReservations={initialReservations} />;
}
