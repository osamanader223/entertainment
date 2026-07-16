'use client';

// Public venue board (/v/[branchCode]) — same neon two-step (category ->
// station) pattern as the customer dashboard's NeonStationGrid, but fully
// anonymized: no prices tied to an account, no booking deep-link — tapping
// anything redirects to sign-in, exactly like the board's previous behavior.
// Deliberately separate from NeonStationGrid (auth-gated deep links) and from
// LiveStationGrid/StationCard (shared with the cashier station picker).

import Image from 'next/image';
import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
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

  useEffect(() => {
    if (selectedCode && !categories.some((c) => c.code === selectedCode)) setSelectedCode(null);
  }, [categories, selectedCode]);

  if (!state) {
    return (
      <div className="neon-theme grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((j) => (
          <div key={j} className="h-[220px] rounded-[20px] border border-[#241B39] bg-[color:var(--neon-surface-1)] animate-pulse" />
        ))}
      </div>
    );
  }

  const selected = categories.find((c) => c.code === selectedCode) ?? null;

  return (
    <div className="neon-theme">
      {!selected ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {categories.map((cat) => {
            const image = STATION_IMAGE_BY_CODE[cat.code];
            const availableCount = cat.stations.filter((s) => s.status === 'available').length;
            const name = locale === 'ar' ? (cat.nameAr || cat.nameEn) : cat.nameEn;
            const priceCents = hourlyPriceCentsByGameTypeCode[cat.code] ?? null;
            const priceLabel = priceCents !== null ? formatMoney(priceCents).replace(/[^\d.,]/g, '') : '—';
            return (
              <button
                key={cat.code}
                type="button"
                onClick={() => setSelectedCode(cat.code)}
                className="rounded-[20px] border border-[#241B39] overflow-hidden flex flex-col text-start"
                style={{ background: 'var(--neon-surface-card-2)' }}
              >
                <div className="relative h-[158px] overflow-hidden w-full">
                  {image ? (
                    <Image src={image} alt="" fill sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw" className="object-cover" />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center text-4xl" style={{ background: 'linear-gradient(160deg,#1E1730,#120E1E)' }} aria-hidden>
                      {cat.icon ?? '🎮'}
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
          })}
        </div>
      ) : (
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
            <span className="text-lg font-extrabold text-[color:var(--neon-text-hi)]">
              {locale === 'ar' ? (selected.nameAr || selected.nameEn) : selected.nameEn}
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {selected.stations.map((s) => {
              const status = STATUS_META[s.status];
              const isAvailable = s.status === 'available';
              return (
                <div key={s.id} className="rounded-[20px] border border-[#241B39] p-4 min-h-[168px] flex flex-col" style={{ background: 'var(--neon-surface-card-2)' }}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-[10px] font-mono text-[color:var(--neon-text-lo)] truncate">{s.code}</div>
                      <div className="font-bold text-sm text-[color:var(--neon-text-hi)] truncate">{s.display_name}</div>
                    </div>
                    <span
                      className="shrink-0 inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[11px] font-bold border"
                      style={{ background: 'rgba(6,6,10,.5)', borderColor: `${status.color}66`, color: status.color }}
                    >
                      <span className="h-[6px] w-[6px] rounded-full" style={{ background: status.color }} />
                      {t(status.labelKey)}
                    </span>
                  </div>
                  <div className="mt-auto pt-3">
                    {isAvailable ? (
                      <button
                        type="button"
                        onClick={() => onStationSelect(s)}
                        className="w-full rounded-xl px-3 py-2 text-[13px] font-extrabold text-white"
                        style={{ background: 'linear-gradient(135deg,#FF2D9E,#7B2FF7)', boxShadow: '0 0 18px -6px rgba(255,45,158,.8)' }}
                      >
                        {t('dashboard.bookNowCta')}
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onJoinQueue(s.game_type_code, s.game_type_name_ar, s.game_type_name_en)}
                        className={cn('w-full rounded-xl px-3 py-2 text-[13px] font-extrabold border')}
                        style={{ borderColor: 'var(--neon-cyan)', background: 'rgba(47,243,243,.08)', color: 'var(--neon-cyan-lt)' }}
                      >
                        {t('dashboard.joinQueueCta')}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
