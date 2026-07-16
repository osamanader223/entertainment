'use client';

import { useMemo } from 'react';
import type { PublicVenueState, PublicStation } from '@/lib/venue';
import { useLiveVenueState } from '@/hooks/useLiveVenueState';
import { StationCard } from '@/components/venue/station-card';
import { cn } from '@/lib/utils';
import { Radio } from 'lucide-react';

interface Props {
  branchCode: string;
  initial?: PublicVenueState;
  selectedStationId: string | null;
  onSelect: (station: PublicStation) => void;
}

interface GameTypeGroup {
  game_type_code: string;
  game_type_name_en: string;
  icon: string | null;
  stations: PublicStation[];
}

/**
 * Cashier-only station picker: same realtime data source as LiveStationGrid,
 * but narrowed to single-select among free ('available') stations only.
 */
export function StationPicker({ branchCode, initial, selectedStationId, onSelect }: Props) {
  const { state, isStale, error } = useLiveVenueState(branchCode, initial);

  const groups = useMemo<GameTypeGroup[]>(() => {
    if (!state) return [];
    const byCode = new Map<string, GameTypeGroup>();
    for (const s of state.stations) {
      if (s.status !== 'available') continue;
      if (!byCode.has(s.game_type_code)) {
        byCode.set(s.game_type_code, {
          game_type_code: s.game_type_code,
          game_type_name_en: s.game_type_name_en,
          icon: s.icon,
          stations: [],
        });
      }
      byCode.get(s.game_type_code)!.stations.push(s);
    }
    return Array.from(byCode.values());
  }, [state]);

  if (error && !state) {
    return (
      <div className="rounded-xl border border-rose-500/30 bg-rose-500/5 p-4 text-sm text-rose-300">
        Could not load stations: {error}
      </div>
    );
  }

  if (!state) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="h-28 rounded-xl bg-muted/10 animate-pulse" />
        ))}
      </div>
    );
  }

  if (groups.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border/60 p-6 text-center text-sm text-muted-foreground">
        No free stations right now — every station is occupied.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-end text-xs text-muted-foreground">
        <span className={cn('inline-flex items-center gap-1.5', isStale && 'text-amber-400')}>
          <Radio className={cn('h-3.5 w-3.5', !isStale && 'text-emerald-400 animate-pulse')} />
          {isStale ? 'refreshing…' : 'live'}
        </span>
      </div>

      {groups.map((group) => (
        <section key={group.game_type_code}>
          <h3 className="text-sm font-semibold flex items-center gap-2 mb-2">
            <span className="text-lg" aria-hidden>
              {group.icon ?? '🎮'}
            </span>
            {group.game_type_name_en}
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 auto-rows-fr items-stretch">
            {group.stations.map((station) => (
              <div
                key={station.id}
                className={cn(
                  'h-full rounded-xl transition-shadow',
                  selectedStationId === station.id && 'ring-2 ring-gold-400'
                )}
              >
                <StationCard station={station} onClick={() => onSelect(station)} />
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
