'use client';

import { useEffect, useState } from 'react';
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
}

export function StationCard({ station, onClick, onConfirmEnd }: Props) {
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

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'group relative w-full text-left rounded-xl border p-4 transition-all',
        'glass hover:border-gold-500/40 hover:-translate-y-0.5',
        statusTone.ring
      )}
    >
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-2xl leading-none" aria-hidden>
              {station.icon ?? '🎮'}
            </span>
            <span className="text-xs font-mono text-muted-foreground">{station.code}</span>
          </div>
          <div className="mt-2 font-semibold">{station.display_name}</div>
          <div className="text-xs text-muted-foreground mt-0.5">{gameTypeName}</div>
        </div>

        <span
          className={cn(
            'shrink-0 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium',
            statusTone.badge
          )}
        >
          <span className={cn('h-1.5 w-1.5 rounded-full', statusTone.dot)} />
          {statusLabel}
        </span>
      </div>

      {remaining && (
        <div className="mt-3 text-2xl font-bold tabular-nums tracking-tight">
          {remaining === 'ending' ? (
            <span className="text-gold-400 animate-pulse">{t('station.endingNow')}</span>
          ) : (
            <span className="text-gold-400">{remaining}</span>
          )}
          {remaining !== 'ending' && (
            <span className="ms-2 text-xs font-normal text-muted-foreground">{t('station.remaining')}</span>
          )}
        </div>
      )}

      {remaining === 'ending' && onConfirmEnd && (
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
      )}

      {station.status === 'available' && (
        <div className="mt-3 text-sm text-emerald-400/80">{t('station.readyToPlay')}</div>
      )}
    </button>
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
