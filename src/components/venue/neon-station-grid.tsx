'use client';

// Dashboard-only neon-arcade re-skin of the live station grid (see
// design_handoff_bolos_alley). Deliberately a SEPARATE component from
// LiveStationGrid/StationCard (venue/live-station-grid.tsx, venue/station-card.tsx)
// — those are shared with the public venue board and the cashier station
// picker, which must stay visually untouched. This one reuses the same data
// hook but renders its own photo-led, two-step (category -> station) markup.
//
// Step navigation is local component state (not a route change) so it's
// instant and the realtime subscription (useLiveVenueState) never unmounts.

import Link from 'next/link';
import Image from 'next/image';
import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Loader2, Check } from 'lucide-react';
import type { PublicStation, PublicVenueState } from '@/lib/venue';
import { useLiveVenueState } from '@/hooks/useLiveVenueState';
import { cn, formatMoney } from '@/lib/utils';
import { useT } from '@/i18n/context';

interface Props {
  branchCode: string;
  initial?: PublicVenueState;
  hourlyPriceCentsByGameTypeCode: Record<string, number | null>;
  /** code -> game_type id (uuid), for deep-linking "Book now" into the booking flow. */
  gameTypeIdByCode: Record<string, string>;
  /** Staff-only: the mockup has no countdown/confirm UI, but this real operational action is preserved — surfaced only once a session has actually ended. */
  onStationConfirmEnd?: (stationId: string) => void | Promise<void>;
}

// Real venue photos, mapped by game_type code (see supabase/seed.sql). Any
// game type without a supplied photo gets a flat gradient placeholder
// instead of a broken image (VR has none, but it's deactivated entirely).
const STATION_IMAGE_BY_CODE: Record<string, string> = {
  pool: '/images/stations/station-billiards.png',
  bowling: '/images/stations/station-bowling.png',
  ps5: '/images/stations/station-ps5.png',
  ping_pong: '/images/stations/station-tabletennis.png',
  foosball: '/images/stations/station-foosball.png',
  karaoke: '/images/stations/station-karaoke.png',
};

interface CategoryGroup {
  code: string;
  nameAr: string;
  nameEn: string;
  icon: string | null;
  stations: PublicStation[];
}

export function NeonStationGrid({ branchCode, initial, hourlyPriceCentsByGameTypeCode, gameTypeIdByCode, onStationConfirmEnd }: Props) {
  const { t, locale } = useT();
  const { state } = useLiveVenueState(branchCode, initial);
  const [selectedCode, setSelectedCode] = useState<string | null>(null);

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

  // If the selected category disappears (e.g. deactivated), fall back to the list.
  useEffect(() => {
    if (selectedCode && !categories.some((c) => c.code === selectedCode)) setSelectedCode(null);
  }, [categories, selectedCode]);

  if (!state) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((j) => (
          <div key={j} className="h-[220px] rounded-[20px] border border-[#241B39] bg-[color:var(--neon-surface-1)] animate-pulse" />
        ))}
      </div>
    );
  }

  const selected = categories.find((c) => c.code === selectedCode) ?? null;

  if (!selected) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 auto-rows-fr items-stretch">
        {categories.map((cat) => (
          <CategoryCard
            key={cat.code}
            category={cat}
            hourlyPriceCents={hourlyPriceCentsByGameTypeCode[cat.code] ?? null}
            onSelect={() => setSelectedCode(cat.code)}
          />
        ))}
      </div>
    );
  }

  const categoryName = locale === 'ar' ? (selected.nameAr || selected.nameEn) : selected.nameEn;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => setSelectedCode(null)}
          className="inline-flex items-center gap-1.5 text-sm font-bold rounded-full border px-3 py-1.5"
          style={{ borderColor: '#241E36', color: 'var(--neon-text-mid)', background: '#111018' }}
        >
          <ArrowLeft className="h-4 w-4 rtl:rotate-180" />
          {t('dashboard.allGamesBack')}
        </button>
        <span className="text-lg font-extrabold text-[color:var(--neon-text-hi)]">{categoryName}</span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 auto-rows-fr items-stretch">
        {selected.stations.map((s) => (
          <NeonStationCard
            key={s.id}
            station={s}
            gameTypeId={gameTypeIdByCode[s.game_type_code]}
            onConfirmEnd={onStationConfirmEnd}
          />
        ))}
      </div>
    </div>
  );
}

function CategoryCard({
  category,
  hourlyPriceCents,
  onSelect,
}: {
  category: CategoryGroup;
  hourlyPriceCents: number | null;
  onSelect: () => void;
}) {
  const { t, locale } = useT();
  const image = STATION_IMAGE_BY_CODE[category.code];
  const availableCount = category.stations.filter((s) => s.status === 'available').length;
  const name = locale === 'ar' ? (category.nameAr || category.nameEn) : category.nameEn;
  const priceLabel = hourlyPriceCents !== null ? formatMoney(hourlyPriceCents).replace(/[^\d.,]/g, '') : '—';

  return (
    <button
      type="button"
      onClick={onSelect}
      className="rounded-[20px] border border-[#241B39] overflow-hidden flex flex-col text-start"
      style={{ background: 'var(--neon-surface-card-2)' }}
    >
      <div className="relative h-[158px] overflow-hidden w-full">
        {image ? (
          <Image src={image} alt="" fill sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw" className="object-cover" />
        ) : (
          <div
            className="absolute inset-0 flex items-center justify-center text-4xl"
            style={{ background: 'linear-gradient(160deg,#1E1730,#120E1E)' }}
            aria-hidden
          >
            {category.icon ?? '🎮'}
          </div>
        )}
        <span className="absolute inset-0 pointer-events-none" style={{ background: 'linear-gradient(to top, rgba(10,8,18,.9), transparent 60%)' }} />
        <span
          className="absolute top-3 end-3 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold backdrop-blur-md border"
          style={{
            background: 'rgba(6,6,10,.72)',
            borderColor: availableCount > 0 ? 'rgba(47,243,243,.4)' : 'rgba(245,196,81,.4)',
            color: availableCount > 0 ? 'var(--neon-cyan)' : 'var(--neon-gold)',
          }}
        >
          <span className="h-[7px] w-[7px] rounded-full" style={{ background: availableCount > 0 ? 'var(--neon-cyan)' : 'var(--neon-gold)' }} />
          {availableCount > 0 ? t('dashboard.nAvailable', { n: String(availableCount) }) : t('dashboard.statusWaitlist')}
        </span>
        <span className="absolute bottom-3 text-[19px] font-extrabold text-white" style={{ textShadow: '0 2px 12px rgba(0,0,0,.8)', insetInlineStart: 14 }}>
          {name}
        </span>
      </div>
      <div className="p-4 flex items-baseline gap-1.5">
        <span className="font-neon-display font-bold text-2xl tabular-nums" style={{ color: 'var(--neon-cyan-lt)' }}>{priceLabel}</span>
        <span className="text-[13px] font-bold text-[color:var(--neon-text-mid)]">{t('dashboard.pricePerHour')}</span>
      </div>
    </button>
  );
}

const STATUS_META: Record<PublicStation['status'], { labelKey: string; color: string }> = {
  available: { labelKey: 'dashboard.statusAvailable', color: 'var(--neon-cyan)' },
  occupied: { labelKey: 'dashboard.statusBusy', color: 'var(--neon-magenta-soft)' },
  reserved: { labelKey: 'dashboard.statusReserved', color: 'var(--neon-purple-lt)' },
  maintenance: { labelKey: 'station.maintenance', color: 'var(--neon-text-lo)' },
  cleaning: { labelKey: 'station.cleaning', color: 'var(--neon-text-lo)' },
};

function NeonStationCard({
  station,
  gameTypeId,
  onConfirmEnd,
}: {
  station: PublicStation;
  gameTypeId?: string;
  onConfirmEnd?: (stationId: string) => void | Promise<void>;
}) {
  const { t, locale } = useT();
  const isAvailable = station.status === 'available';
  const status = STATUS_META[station.status];
  const [confirmPending, setConfirmPending] = useState(false);
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
  const bookHref = gameTypeId ? `/dashboard/book?game=${gameTypeId}&station=${station.id}` : '/dashboard/book';

  return (
    <div
      className="relative rounded-[20px] border border-[#241B39] p-4 min-h-[212px] h-full flex flex-col"
      style={{ background: 'var(--neon-surface-card-2)' }}
    >
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

        {isEnding && onConfirmEnd ? (
          <button
            type="button"
            disabled={confirmPending}
            onClick={async () => {
              setConfirmPending(true);
              try { await onConfirmEnd(station.id); } finally { setConfirmPending(false); }
            }}
            className="w-full rounded-xl px-3 py-2 text-[13px] font-extrabold text-white inline-flex items-center justify-center gap-1.5"
            style={{ background: 'linear-gradient(135deg,#FF2D9E,#7B2FF7)', boxShadow: '0 0 18px -6px rgba(255,45,158,.8)' }}
          >
            {confirmPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
            {t('station.confirmEnded')}
          </button>
        ) : isAvailable ? (
          <Link
            href={bookHref}
            className="block w-full text-center rounded-xl px-3 py-2 text-[13px] font-extrabold text-white"
            style={{ background: 'linear-gradient(135deg,#FF2D9E,#7B2FF7)', boxShadow: '0 0 18px -6px rgba(255,45,158,.8)' }}
          >
            {t('dashboard.bookNowCta')}
          </Link>
        ) : (
          <Link
            href="/dashboard/queue"
            className="block w-full text-center rounded-xl px-3 py-2 text-[13px] font-extrabold border"
            style={{ borderColor: 'var(--neon-cyan)', background: 'rgba(47,243,243,.08)', color: 'var(--neon-cyan-lt)' }}
          >
            {t('dashboard.joinQueueCta')}
          </Link>
        )}
      </div>
    </div>
  );
}
