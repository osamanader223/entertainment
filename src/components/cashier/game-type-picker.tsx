'use client';

import { useMemo } from 'react';
import type { PublicStation } from '@/lib/venue';
import { Button } from '@/components/ui/button';
import { useT } from '@/i18n/context';

interface GameTypeOption {
  code: string;
  nameEn: string;
  nameAr: string;
  icon: string | null;
  availableCount: number;
}

interface Props {
  stations: PublicStation[];
  selectedCode: string | null;
  onSelect: (code: string) => void;
}

/**
 * Cashier step 1: pick a game type before narrowing to its stations —
 * mirrors the customer booking flow's own step order (game -> station ->
 * time) instead of dumping every station across every game at once.
 *
 * Takes stations as a prop rather than calling useLiveVenueState itself —
 * that hook subscribes to a realtime channel named after the branch, and
 * the underlying Supabase browser client is a singleton, so a second
 * simultaneous subscriber (this + StationPicker) to the same channel name
 * crashes with "cannot add postgres_changes callbacks after subscribe()".
 * CashierFlow owns the one live subscription and passes data down.
 */
export function GameTypePicker({ stations, selectedCode, onSelect }: Props) {
  const { locale } = useT();

  const gameTypes = useMemo<GameTypeOption[]>(() => {
    const map = new Map<string, GameTypeOption>();
    for (const s of stations) {
      if (!map.has(s.game_type_code)) {
        map.set(s.game_type_code, { code: s.game_type_code, nameEn: s.game_type_name_en, nameAr: s.game_type_name_ar, icon: s.icon, availableCount: 0 });
      }
      if (s.status === 'available') map.get(s.game_type_code)!.availableCount += 1;
    }
    return Array.from(map.values());
  }, [stations]);

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
      {gameTypes.map((g) => {
        const name = locale === 'ar' ? (g.nameAr || g.nameEn) : g.nameEn;
        return (
          <Button
            key={g.code}
            type="button"
            variant={selectedCode === g.code ? 'gold' : 'outline'}
            className="h-16 flex-col gap-1"
            onClick={() => onSelect(g.code)}
          >
            <span className="text-xl" aria-hidden>{g.icon ?? '🎮'}</span>
            <span className="text-xs">{name}</span>
          </Button>
        );
      })}
    </div>
  );
}
