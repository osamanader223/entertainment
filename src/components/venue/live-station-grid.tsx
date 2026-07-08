'use client';

import { useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { PublicVenueState, PublicStation, PublicQueueGroup } from '@/lib/venue';
import { useLiveVenueState } from '@/hooks/useLiveVenueState';
import { StationCard } from './station-card';
import { cn } from '@/lib/utils';
import { Users, Clock, Radio } from 'lucide-react';
import { useT } from '@/i18n/context';

interface Props {
  branchCode: string;
  initial?: PublicVenueState;
  /** Called when a customer taps an available station — for booking flow */
  onStationSelect?: (station: PublicStation) => void;
  /** Called when a customer taps a queue group to join */
  onQueueJoin?: (group: PublicQueueGroup) => void;
  /** Staff-only: called when "Confirm ended" is tapped on a station whose timer hit zero */
  onStationConfirmEnd?: (stationId: string) => void | Promise<void>;
}

export function LiveStationGrid({
  branchCode,
  initial,
  onStationSelect,
  onQueueJoin,
  onStationConfirmEnd,
}: Props) {
  const { t, locale } = useT();
  const { state, isStale, error } = useLiveVenueState(branchCode, initial);

  const groups = useMemo(() => {
    if (!state) return [];
    const byCode = new Map<string, { meta: PublicQueueGroup; stations: PublicStation[] }>();
    for (const s of state.stations) {
      const queueMeta = state.queue.find((q) => q.game_type_code === s.game_type_code) ?? {
        game_type_code: s.game_type_code,
        game_type_name_ar: s.game_type_name_ar,
        game_type_name_en: s.game_type_name_en,
        icon: s.icon,
        waiting_count: 0,
        called_count: 0,
        now_serving_ticket: null,
      };
      if (!byCode.has(s.game_type_code)) {
        byCode.set(s.game_type_code, { meta: queueMeta, stations: [] });
      }
      byCode.get(s.game_type_code)!.stations.push(s);
    }
    return Array.from(byCode.values());
  }, [state]);

  if (error && !state) {
    return (
      <div className="rounded-xl border border-rose-500/30 bg-rose-500/5 p-6 text-rose-300">
        {t('venue.couldNotLoad')}: {error}
      </div>
    );
  }

  if (!state) {
    return <SkeletonGrid />;
  }

  return (
    <div className="space-y-8">
      <SummaryBar state={state} isStale={isStale} />

      {groups.map(({ meta, stations }, groupIndex) => {
        const gameTypeName = locale === 'ar'
          ? (meta.game_type_name_ar || meta.game_type_name_en)
          : meta.game_type_name_en;

        return (
          <motion.section
            key={meta.game_type_code}
            layout
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: groupIndex * 0.05 }}
          >
            <div className="flex items-end justify-between mb-3">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <span className="text-xl" aria-hidden>
                  {meta.icon ?? '🎮'}
                </span>
                {gameTypeName}
              </h2>

              {meta.waiting_count + meta.called_count > 0 ? (
                <button
                  type="button"
                  onClick={() => onQueueJoin?.(meta)}
                  className="text-xs text-muted-foreground hover:text-gold-400 transition-colors inline-flex items-center gap-1.5"
                >
                  <Users className="h-3.5 w-3.5" />
                  {t('queue.waitingCount', { n: String(meta.waiting_count) })}
                  {meta.now_serving_ticket && (
                    <span className="ms-1 px-1.5 py-0.5 rounded bg-gold-500/15 text-gold-300">
                      {t('venue.servingTicket', { n: String(meta.now_serving_ticket) })}
                    </span>
                  )}
                </button>
              ) : (
                <span className="text-xs text-emerald-400/80">{t('venue.noWait')}</span>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              <AnimatePresence mode="popLayout">
                {stations.map((s, i) => (
                  <StationCard
                    key={s.id}
                    station={s}
                    index={i}
                    onClick={s.status === 'available' ? () => onStationSelect?.(s) : undefined}
                    onConfirmEnd={onStationConfirmEnd}
                  />
                ))}
              </AnimatePresence>
            </div>
          </motion.section>
        );
      })}
    </div>
  );
}

function SummaryBar({ state, isStale }: { state: PublicVenueState; isStale: boolean }) {
  const { t } = useT();
  const { summary, branch } = state;
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-xl glass">
      <div className="flex items-center gap-4 text-sm">
        <Stat label={t('venue.free')} value={summary.available_count} tone="emerald" />
        <Stat label={t('venue.busy')} value={summary.occupied_count} tone="amber" />
        <Stat label={t('venue.total')} value={summary.total_stations} tone="muted" />
      </div>
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <Clock className="h-3.5 w-3.5" />
        <span>{branch.opens_at?.slice(0, 5)} – {branch.closes_at?.slice(0, 5)}</span>
        <span aria-hidden>·</span>
        <span className={cn('inline-flex items-center gap-1.5', isStale && 'text-amber-400')}>
          <Radio className={cn('h-3.5 w-3.5', !isStale && 'text-emerald-400 animate-pulse')} />
          {isStale ? t('venue.refreshing') : t('venue.live')}
        </span>
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: 'emerald' | 'amber' | 'muted' }) {
  const color =
    tone === 'emerald' ? 'text-emerald-300' : tone === 'amber' ? 'text-amber-300' : 'text-muted-foreground';
  return (
    <div className="flex items-baseline gap-1.5">
      <span className={cn('relative inline-grid text-2xl font-bold tabular-nums overflow-hidden', color)}>
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span
            key={value}
            initial={{ y: -20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 20, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 400, damping: 28 }}
            className="col-start-1 row-start-1"
          >
            {value}
          </motion.span>
        </AnimatePresence>
      </span>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}

function SkeletonGrid() {
  return (
    <div className="space-y-8">
      <div className="h-16 rounded-xl bg-muted/20 animate-pulse" />
      {[1, 2].map((i) => (
        <div key={i}>
          <div className="h-6 w-40 rounded bg-muted/20 animate-pulse mb-3" />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {[1, 2, 3, 4].map((j) => (
              <div key={j} className="h-32 rounded-xl bg-muted/10 animate-pulse" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
