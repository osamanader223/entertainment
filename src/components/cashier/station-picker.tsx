'use client';

import { useMemo } from 'react';
import type { PublicStation } from '@/lib/venue';
import { StationCard } from '@/components/venue/station-card';
import { cn } from '@/lib/utils';
import { useT } from '@/i18n/context';

interface Props {
  stations: PublicStation[];
  /** Cashier step 2 only shows the stations of the game type picked in step 1. */
  gameTypeCode: string;
  selectedStationId: string | null;
  onSelect: (station: PublicStation) => void;
}

/**
 * Cashier-only station picker, narrowed to one game type. Every station of
 * that type is shown (not just free ones) — unavailable stations are dimmed
 * and non-interactive, with their status badge (already part of StationCard)
 * serving as the reason.
 *
 * Takes stations as a prop (see game-type-picker.tsx for why) rather than
 * subscribing to live venue state itself — CashierFlow owns the one
 * subscription for the whole flow.
 */
export function StationPicker({ stations, gameTypeCode, selectedStationId, onSelect }: Props) {
  const { t } = useT();

  const filtered = useMemo<PublicStation[]>(
    () => stations.filter((s) => s.game_type_code === gameTypeCode),
    [stations, gameTypeCode],
  );

  if (filtered.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border/60 p-6 text-center text-sm text-muted-foreground">
        {t('cashier.noStationsForGame')}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 auto-rows-fr items-stretch">
      {filtered.map((station) => {
        const isAvailable = station.status === 'available';
        return (
          <div
            key={station.id}
            className={cn(
              'h-full rounded-xl transition-shadow',
              selectedStationId === station.id && 'ring-2 ring-gold-400',
              !isAvailable && 'opacity-50 pointer-events-none',
            )}
          >
            <StationCard station={station} onClick={isAvailable ? () => onSelect(station) : undefined} />
          </div>
        );
      })}
    </div>
  );
}
