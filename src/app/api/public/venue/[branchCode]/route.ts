import { NextResponse } from 'next/server';
import { resolveBranchByCode, getPublicVenueState } from '@/lib/venue';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

/**
 * GET /api/public/venue/[branchCode]
 *
 * Returns the public, anonymized live state of a branch.
 * No authentication required. Strictly no PII in the response.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ branchCode: string }> }
) {
  const { branchCode } = await params;

  const branchId = await resolveBranchByCode(branchCode);
  if (!branchId) {
    return NextResponse.json({ error: 'branch_not_found' }, { status: 404 });
  }

  const state = await getPublicVenueState(branchId);
  if (!state) {
    return NextResponse.json({ error: 'state_unavailable' }, { status: 503 });
  }

  return NextResponse.json(state, {
    headers: {
      'Cache-Control': 'public, max-age=5, s-maxage=5, stale-while-revalidate=15',
    },
  });
}
