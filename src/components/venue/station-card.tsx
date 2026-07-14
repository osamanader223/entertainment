'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { PublicStation } from '@/lib/venue';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Loader2, Check } from 'lucide-react';
import { useT } from '@/i18n/context';

interface Props {
  station: PublicStation;
  onClick?: () => void;
  /** Staff-only: render a "Confirm ended" button once the timer hits zero. */
  onConfirmEnd?: (stationId: string) => void | Promise<void>;
  /** Position within its group — staggers the entrance animation slightly. */
  index?: number;
}

export function StationCard({ station, onClick, onConfirmEnd, index = 0 }: Props) {
  const { t, locale } = useT();
  const [remaining, setRemaining] = useState<string | null>(null);
  const [confirmPending, setConfirmPending] = useState(false);

  const statusTone = STATUS_STYLE[station.status];
  const statusLabel = t(`station.${STATUS_KEY[station.status]}`);

  const gameTypeName = locale === 'ar'
    ? (station.game_type_name_ar || station.game_type_name_en)
    : station.game_type_name_en;

  useEffect(() => {
    if (station.status !== 'occupied' || !station.estimated_free_at) {
      setRemaining(null);
      return;
    }
    const tick = () => {
      const ms = new Date(station.estimated_free_at!).getTime() - Date.now();
      if (ms <= 0) {
        setRemaining('ending');
        return;
      }
      const totalSec = Math.floor(ms / 1000);
      const m = Math.floor(totalSec / 60);
      const s = totalSec % 60;
      setRemaining(`${m}:${String(s).padStart(2, '0')}`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [station.estimated_free_at, station.status]);

  const isEnding = remaining === 'ending';

  return (
    <motion.button
      type="button"
      onClick={onClick}
      layout
      initial={{ opacity: 0, y: 16, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      whileHover={{ y: -6 }}
      whileTap={{ scale: 0.97 }}
      transition={{ type: 'spring', stiffness: 300, damping: 24, delay: Math.min(index, 8) * 0.04 }}
      className={cn(
        'group relative w-full h-full min-h-[168px] flex flex-col text-start rounded-xl border p-4',
        'glass hover:border-gold-500/40',
        statusTone.ring,
        isEnding && 'animate-gold-pulse'
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-2xl leading-none shrink-0" aria-hidden>
              {station.icon ?? '🎮'}
            </span>
            <span className="text-xs font-mono text-muted-foreground truncate">{station.code}</span>
          </div>
          <div className="mt-2 font-semibold truncate">{station.display_name}</div>
          <div className="text-xs text-muted-foreground mt-0.5 truncate">{gameTypeName}</div>
        </div>

        <AnimatePresence mode="wait">
          <motion.span
            key={station.status}
            initial={{ opacity: 0, scale: 0.75 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.75 }}
            transition={{ duration: 0.18 }}
            className={cn(
              'shrink-0 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium',
              statusTone.badge
            )}
          >
            <span className={cn('h-1.5 w-1.5 rounded-full', statusTone.dot)} />
            {statusLabel}
          </motion.span>
        </AnimatePresence>
      </div>

      <AnimatePresence mode="wait">
        {remaining && (
          <motion.div
            key={isEnding ? 'ending' : 'counting'}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="mt-auto pt-3 text-2xl font-bold tabular-nums tracking-tight"
          >
            {isEnding ? (
              <span className="text-gold-400 animate-pulse">{t('station.endingNow')}</span>
            ) : (
              <span className="text-gold-400">{remaining}</span>
            )}
            {!isEnding && (
              <span className="ms-2 text-xs font-normal text-muted-foreground">{t('station.remaining')}</span>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isEnding && onConfirmEnd && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
          >
            <Button
              type="button"
              variant="gold"
              size="sm"
              className="mt-3 w-full"
              disabled={confirmPending}
              onClick={async (e) => {
                e.stopPropagation();
                e.preventDefault();
                setConfirmPending(true);
                try {
                  await onConfirmEnd(station.id);
                } finally {
                  setConfirmPending(false);
                }
              }}
            >
              {confirmPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
              {t('station.confirmEnded')}
            </Button>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {station.status === 'available' && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="mt-auto pt-3 text-sm text-emerald-400/80"
          >
            {t('station.readyToPlay')}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.button>
  );
}

const STATUS_KEY: Record<PublicStation['status'], string> = {
  available: 'free',
  occupied: 'busy',
  reserved: 'reserved',
  maintenance: 'maintenance',
  cleaning: 'cleaning',
};

const STATUS_STYLE: Record<
  PublicStation['status'],
  { badge: string; dot: string; ring: string }
> = {
  available: {
    badge: 'bg-emerald-500/15 text-emerald-300',
    dot: 'bg-emerald-400',
    ring: 'border-emerald-500/20',
  },
  occupied: {
    badge: 'bg-amber-500/15 text-amber-300',
    dot: 'bg-amber-400 animate-pulse',
    ring: 'border-amber-500/20',
  },
  reserved: {
    badge: 'bg-blue-500/15 text-blue-300',
    dot: 'bg-blue-400',
    ring: 'border-blue-500/20',
  },
  maintenance: {
    badge: 'bg-rose-500/15 text-rose-300',
    dot: 'bg-rose-400',
    ring: 'border-rose-500/20 opacity-70',
  },
  cleaning: {
    badge: 'bg-slate-500/15 text-slate-300',
    dot: 'bg-slate-400',
    ring: 'border-slate-500/20',
  },
};
