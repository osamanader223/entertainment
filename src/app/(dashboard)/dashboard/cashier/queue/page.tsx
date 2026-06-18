import { requireRole } from '@/lib/auth';
import { resolveBranchByCode, getPublicVenueState } from '@/lib/venue';
import { getBranchQueueOverview } from '@/lib/queue';
import { StaffQueuePanel } from '@/components/queue/staff-queue-panel';

export const metadata = { title: 'Queue management' };
export const dynamic = 'force-dynamic';

const DEMO_TENANT_ID = '11111111-1111-1111-1111-111111111111';
const DEMO_BRANCH_ID = '22222222-2222-2222-2222-222222222222';
const DEMO_BRANCH_CODE = 'JED-01';
const STAFF_ROLES = ['staff', 'manager', 'tenant_admin'] as const;

export default async function StaffQueuePage() {
  const ctx = await requireRole(DEMO_TENANT_ID, [...STAFF_ROLES]);

  const initialState = await getPublicVenueState(DEMO_BRANCH_ID);
  const initialGroups = await getBranchQueueOverview(DEMO_TENANT_ID, DEMO_BRANCH_ID);
  const branchId = (await resolveBranchByCode(DEMO_BRANCH_CODE)) ?? DEMO_BRANCH_ID;

  return (
    <StaffQueuePanel
      tenantId={DEMO_TENANT_ID}
      branchId={branchId}
      branchCode={DEMO_BRANCH_CODE}
      staffUserId={ctx.userId}
      initialGroups={initialGroups}
      initialState={initialState ?? undefined}
    />
  );
}
