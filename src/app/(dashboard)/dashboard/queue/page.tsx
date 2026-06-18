import { requireAuth } from '@/lib/auth';
import { getWalletBalance } from '@/lib/wallet';
import { resolveBranchByCode, getPublicVenueState } from '@/lib/venue';
import { getCustomerQueueTickets, getQueueableGameTypes } from '@/lib/queue';
import { QueueFlow } from '@/components/queue/queue-flow';

export const metadata = { title: 'Queue' };
export const dynamic = 'force-dynamic';

const DEMO_TENANT_ID = '11111111-1111-1111-1111-111111111111';
const DEMO_BRANCH_ID = '22222222-2222-2222-2222-222222222222';
const DEMO_BRANCH_CODE = 'JED-01';

export default async function QueuePage() {
  const ctx = await requireAuth('/dashboard/queue');

  const walletBalanceCents = await getWalletBalance(DEMO_TENANT_ID, ctx.userId);
  const branchId = await resolveBranchByCode(DEMO_BRANCH_CODE);
  const initialState = branchId ? await getPublicVenueState(branchId) : null;
  const initialTickets = await getCustomerQueueTickets(DEMO_TENANT_ID, ctx.userId);
  const gameTypes = await getQueueableGameTypes(DEMO_TENANT_ID);

  return (
    <QueueFlow
      branchId={DEMO_BRANCH_ID}
      branchCode={DEMO_BRANCH_CODE}
      initialWalletBalanceCents={walletBalanceCents}
      initialTickets={initialTickets}
      gameTypes={gameTypes}
      initial={initialState ?? undefined}
    />
  );
}
