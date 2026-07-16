import { requireAuth } from '@/lib/auth';
import { getWalletBalance } from '@/lib/wallet';
import { resolveBranchByCode, getPublicVenueState } from '@/lib/venue';
import { BookingFlow } from '@/components/booking/booking-flow';

export const metadata = { title: 'Book a station' };
export const dynamic = 'force-dynamic';

const DEMO_TENANT_ID = '11111111-1111-1111-1111-111111111111';
const DEMO_BRANCH_ID = '22222222-2222-2222-2222-222222222222';
const DEMO_BRANCH_CODE = 'JED-01';

export default async function BookPage({
  searchParams,
}: {
  searchParams: Promise<{ offer?: string; game?: string; station?: string }>;
}) {
  const ctx = await requireAuth('/dashboard/book');
  const { offer, game, station } = await searchParams;

  const walletBalanceCents = await getWalletBalance(DEMO_TENANT_ID, ctx.userId);
  const branchId = await resolveBranchByCode(DEMO_BRANCH_CODE);
  const initialState = branchId ? await getPublicVenueState(branchId) : null;

  return (
    <BookingFlow
      tenantId={DEMO_TENANT_ID}
      branchId={DEMO_BRANCH_ID}
      branchCode={DEMO_BRANCH_CODE}
      customerId={ctx.userId}
      initialWalletBalanceCents={walletBalanceCents}
      initial={initialState ?? undefined}
      initialOfferCode={offer}
      initialGameTypeId={game}
      initialStationId={station}
    />
  );
}
