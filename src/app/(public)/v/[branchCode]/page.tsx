import { notFound } from 'next/navigation';
import { resolveBranchByCode, getPublicVenueState } from '@/lib/venue';
import { computeSessionPrice } from '@/lib/cashier';
import { getQueueableGameTypes } from '@/lib/queue';
import { getPublicOffers } from '@/lib/offers';
import { PublicLiveGrid } from './actions';
import { AmbientBackground } from '@/components/venue/ambient-background';
import { PublicOffersShowcase } from '@/components/offers/public-offers-showcase';
import { MapPin } from 'lucide-react';
import { getServerDict } from '@/i18n/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const DEMO_TENANT_ID = '11111111-1111-1111-1111-111111111111';

interface PageProps {
  params: Promise<{ branchCode: string }>;
}

export async function generateMetadata({ params }: PageProps) {
  const { branchCode } = await params;
  const branchId = await resolveBranchByCode(branchCode);
  if (!branchId) return { title: 'Venue not found' };
  const state = await getPublicVenueState(branchId);
  if (!state) return { title: 'Venue' };
  return {
    title: `${state.branch.display_name} — live status`,
    description: `${state.summary.available_count} of ${state.summary.total_stations} stations free right now.`,
  };
}

export default async function PublicVenuePage({ params }: PageProps) {
  const { branchCode } = await params;
  const branchId = await resolveBranchByCode(branchCode);
  if (!branchId) notFound();

  const initialState = await getPublicVenueState(branchId);
  if (!initialState) notFound();

  const { d } = await getServerDict();

  // Real hourly price per game type present at this branch — computed from
  // our actual pricing rules for the category cards, not hardcoded.
  const gameTypes = await getQueueableGameTypes(DEMO_TENANT_ID);
  const gameTypeByCode = new Map(gameTypes.map((g) => [g.code, g]));
  const presentCodes = [...new Set(initialState.stations.map((s) => s.game_type_code))];
  const priceEntries = await Promise.all(
    presentCodes.map(async (code): Promise<[string, number | null]> => {
      const gt = gameTypeByCode.get(code);
      if (!gt) return [code, null];
      try {
        const cents = await computeSessionPrice({ gameTypeId: gt.id, durationMinutes: 60, branchId });
        return [code, cents];
      } catch {
        return [code, null];
      }
    }),
  );
  const hourlyPriceCentsByGameTypeCode = Object.fromEntries(priceEntries);
  const offers = await getPublicOffers(DEMO_TENANT_ID, branchId);

  return (
    <div className="max-w-7xl mx-auto px-6 py-8 space-y-8">
      <AmbientBackground />
      <header className="space-y-3">
        <div className="inline-flex items-center gap-2 text-xs text-muted-foreground">
          <span className="inline-flex h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
          {d.venue.liveNow}
        </div>
        <h1 className="text-3xl md:text-4xl font-bold">
          {initialState.branch.display_name}
        </h1>
        {initialState.branch.city && (
          <div className="inline-flex items-center gap-1.5 text-muted-foreground">
            <MapPin className="h-4 w-4" />
            {initialState.branch.city}
          </div>
        )}
      </header>

      {offers.length > 0 && <PublicOffersShowcase offers={offers} />}

      <PublicLiveGrid branchCode={branchCode} initial={initialState ?? undefined} hourlyPriceCentsByGameTypeCode={hourlyPriceCentsByGameTypeCode} />
    </div>
  );
}
