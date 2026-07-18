'use client';

// Public venue board (/v/[branchCode]) — shows every active station at
// once, grouped under game-type section headers. Deliberately NOT the
// two-step category->station click-through the customer dashboard uses
// (NeonStationGrid) — a public passerby glancing at a board wants the whole
// picture at once, not a tap-to-drill-down flow. Anonymized: no prices tied
// to an account, no booking deep-link — tapping anything redirects to
// sign-in. Deliberately separate from NeonStationGrid (auth-gated deep
// links) and from LiveStationGrid/StationCard (shared with the cashier
// station picker).

import { useEffect, useMemo, useState } from 'react';
import type { PublicStation, PublicVenueState } from '@/lib/venue';
import { useLiveVenueState } from '@/hooks/useLiveVenueState';
import { cn, formatMoney } from '@/lib/utils';
import { useT } from '@/i18n/context';

interface Props {
  branchCode: string;
  initial?: PublicVenueState;
  hourlyPriceCentsByGameTypeCode: Record<string, number | null>;
  onStationSelect: (station: PublicStation) => void;
  onJoinQueue: (gameTypeCode: string, gameTypeNameAr: string, gameTypeNameEn: string) => void;
}

interface CategoryGroup {
  code: string;
  nameAr: string;
  nameEn: string;
  icon: string | null;
  stations: PublicStation[];
}

const STATUS_META: Record<PublicStation['status'], { labelKey: string; color: string }> = {
  available: { labelKey: 'dashboard.statusAvailable', color: 'var(--neon-cyan)' },
  occupied: { labelKey: 'dashboard.statusBusy', color: 'var(--neon-magenta-soft)' },
  reserved: { labelKey: 'dashboard.statusReserved', color: 'var(--neon-purple-lt)' },
  maintenance: { labelKey: 'station.maintenance', color: 'var(--neon-text-lo)' },
  cleaning: { labelKey: 'station.cleaning', color: 'var(--neon-text-lo)' },
};

export function PublicStationGrid({ branchCode, initial, hourlyPriceCentsByGameTypeCode, onStationSelect, onJoinQueue }: Props) {
  const { t, locale } = useT();
  const { state } = useLiveVenueState(branchCode, initial);

  // Stations arrive pre-sorted by game_types.sort_order (see
  // get_public_venue_state's `order by gt.sort_order, s.code`), so building
  // this map by iteration order already yields the correct section order.
  const categories = useMemo<CategoryGroup[]>(() => {
    if (!state) return [];
    const map = new Map<string, CategoryGroup>();
    for (const s of state.stations) {
      if (!map.has(s.game_type_code)) {
        map.set(s.game_type_code, { code: s.game_type_code, nameAr: s.game_type_name_ar, nameEn: s.game_type_name_en, icon: s.icon, stations: [] });
      }
      map.get(s.game_type_code)!.stations.push(s);
    }
    return Array.from(map.values());
  }, [state]);

  if (!state) {
    return (
      <div className="neon-theme flex flex-col gap-8">
        {[1, 2].map((section) => (
          <div key={section} className="flex flex-col gap-3">
            <div className="h-6 w-40 rounded bg-[color:var(--neon-surface-1)] animate-pulse" />
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 auto-rows-fr items-stretch">
              {[1, 2, 3, 4].map((j) => (
                <div key={j} className="h-[212px] rounded-[20px] border border-[#241B39] bg-[color:var(--neon-surface-1)] animate-pulse" />
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="neon-theme flex flex-col gap-8">
      {categories.map((cat) => {
        const name = locale === 'ar' ? (cat.nameAr || cat.nameEn) : cat.nameEn;
        const availableCount = cat.stations.filter((s) => s.status === 'available').length;
        const priceCents = hourlyPriceCentsByGameTypeCode[cat.code] ?? null;
        const priceLabel = priceCents !== null ? formatMoney(priceCents).replace(/[^\d.,]/g, '') : null;

        return (
          <section key={cat.code}>
            <div className="flex items-center justify-between gap-3 mb-3.5">
              <div className="flex items-center gap-2">
                <span className="text-xl" aria-hidden>{cat.icon ?? '🎮'}</span>
                <span className="text-lg font-extrabold text-[color:var(--neon-text-hi)]">{name}</span>
              </div>
              <div className="flex items-center gap-3 text-[13px] font-bold shrink-0">
                {priceLabel && (
                  <span style={{ color: 'var(--neon-text-mid)' }}>
                    <span className="font-neon-display" style={{ color: 'var(--neon-cyan-lt)' }}>{priceLabel}</span> {t('dashboard.pricePerHour')}
                  </span>
                )}
                <span style={{ color: availableCount > 0 ? 'var(--neon-cyan)' : 'var(--neon-gold)' }}>
                  {availableCount > 0 ? t('dashboard.nAvailable', { n: String(availableCount) }) : t('dashboard.statusWaitlist')}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 auto-rows-fr items-stretch">
              {cat.stations.map((s) => (
                <PublicStationCard key={s.id} station={s} onStationSelect={onStationSelect} onJoinQueue={onJoinQueue} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function PublicStationCard({
  station,
  onStationSelect,
  onJoinQueue,
}: {
  station: PublicStation;
  onStationSelect: (station: PublicStation) => void;
  onJoinQueue: (gameTypeCode: string, gameTypeNameAr: string, gameTypeNameEn: string) => void;
}) {
  const { t, locale } = useT();
  const isAvailable = station.status === 'available';
  const status = STATUS_META[station.status];
  const [remaining, setRemaining] = useState<string | null>(null);

  const gameTypeName = locale === 'ar' ? (station.game_type_name_ar || station.game_type_name_en) : station.game_type_name_en;

  useEffect(() => {
    if (station.status !== 'occupied' || !station.estimated_free_at) { setRemaining(null); return; }
    const tick = () => {
      const ms = new Date(station.estimated_free_at!).getTime() - Date.now();
      if (ms <= 0) { setRemaining('ending'); return; }
      const totalSec = Math.floor(ms / 1000);
      setRemaining(`${Math.floor(totalSec / 60)}:${String(totalSec % 60).padStart(2, '0')}`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [station.status, station.estimated_free_at]);

  const isEnding = remaining === 'ending';

  return (
    <div className="relative rounded-[20px] border border-[#241B39] p-4 min-h-[212px] h-full flex flex-col" style={{ background: 'var(--neon-surface-card-2)' }}>
      {/* Identity row: status badge leading, game icon trailing (mirrors automatically in RTL via flex + dir) */}
      <div className="flex items-center justify-between gap-2">
        <span
          className="shrink-0 inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[11px] font-bold border"
          style={{ background: 'rgba(6,6,10,.5)', borderColor: `${status.color}66`, color: status.color }}
        >
          <span className="h-[6px] w-[6px] rounded-full" style={{ background: status.color }} />
          {t(status.labelKey)}
        </span>
        <span className="text-lg leading-none shrink-0" aria-hidden>{station.icon ?? '🎮'}</span>
      </div>

      {/* The code is the visual anchor — this is what staff/customers say out loud. */}
      <div className="mt-3 min-w-0">
        <div className="font-neon-display font-bold text-xl tracking-wide truncate" style={{ color: 'var(--neon-cyan)' }}>
          {station.code}
        </div>
        <div className="text-sm font-bold text-[color:var(--neon-text-hi)] truncate mt-0.5">{station.display_name}</div>
        <div className="text-xs text-[color:var(--neon-text-lo)] truncate mt-0.5">{gameTypeName}</div>
      </div>

      <div className="mt-auto pt-3 flex flex-col gap-2">
        {remaining ? (
          <div className="font-neon-display font-bold text-lg tabular-nums" style={{ color: 'var(--neon-magenta-soft)' }}>
            {isEnding ? t('station.endingNow') : (
              <>
                {remaining}
                <span className="ms-1.5 text-xs font-normal font-sans" style={{ color: 'var(--neon-text-lo)' }}>{t('station.remaining')}</span>
              </>
            )}
          </div>
        ) : isAvailable ? (
          <div className="text-xs font-bold" style={{ color: 'var(--neon-cyan)' }}>{t('station.readyToPlay')}</div>
        ) : null}

        {isAvailable ? (
          <button
            type="button"
            onClick={() => onStationSelect(station)}
            className="w-full rounded-xl px-3 py-2 text-[13px] font-extrabold text-white"
            style={{ background: 'linear-gradient(135deg,#FF2D9E,#7B2FF7)', boxShadow: '0 0 18px -6px rgba(255,45,158,.8)' }}
          >
            {t('dashboard.bookNowCta')}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => onJoinQueue(station.game_type_code, station.game_type_name_ar, station.game_type_name_en)}
            className={cn('w-full rounded-xl px-3 py-2 text-[13px] font-extrabold border')}
            style={{ borderColor: 'var(--neon-cyan)', background: 'rgba(47,243,243,.08)', color: 'var(--neon-cyan-lt)' }}
          >
            {t('dashboard.joinQueueCta')}
          </button>
        )}
      </div>
    </div>
  );
}
