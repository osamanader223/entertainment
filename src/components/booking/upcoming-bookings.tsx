'use client';

import { useCallback, useEffect, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { formatMoney, translateReason } from '@/lib/utils';
import { useT } from '@/i18n/context';
import type { CustomerUpcomingBooking } from '@/lib/booking';
import { getMyUpcomingBookingsAction, cancelMyBookingAction } from '@/app/(dashboard)/dashboard/book/actions';
import { CalendarClock, Loader2 } from 'lucide-react';

const NO_SHOW_CUTOFF_MINUTES = 10;

// Not part of the design_handoff_bolos_alley mockup (which has no upcoming-
// reservations section) — kept as a real, already-shipped feature and
// re-themed to match the surrounding neon canvas rather than dropped.
export function UpcomingBookings({ customerId, initialBookings }: { customerId: string; initialBookings: CustomerUpcomingBooking[] }) {
  const { t } = useT();
  const [bookings, setBookings] = useState(initialBookings);
  const [, startRefresh] = useTransition();
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const refresh = useCallback(() => {
    startRefresh(async () => {
      const res = await getMyUpcomingBookingsAction();
      if (res.ok) setBookings(res.bookings);
    });
  }, []);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`my-bookings:${customerId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings', filter: `customer_id=eq.${customerId}` }, () => refresh())
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [customerId, refresh]);

  if (bookings.length === 0) return null;

  const handleCancel = (bookingId: string) => {
    setCancellingId(bookingId);
    startRefresh(async () => {
      const res = await cancelMyBookingAction({ bookingId });
      setCancellingId(null);
      if (!res.ok) {
        toast.error(translateReason(t, 'scheduling', res.error));
        return;
      }
      toast.success(t('scheduling.reservationCancelled'));
      refresh();
    });
  };

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-xl font-extrabold text-[color:var(--neon-text-hi)] flex items-center gap-2">
        <CalendarClock className="h-5 w-5" style={{ color: 'var(--neon-magenta-soft)' }} />
        {t('scheduling.upcomingBookings')}
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {bookings.map((b) => {
          const minutesUntil = Math.round((new Date(b.scheduledStartAt).getTime() - Date.now()) / 60_000);
          const canCancel = b.status === 'confirmed' && minutesUntil > NO_SHOW_CUTOFF_MINUTES;

          return (
            <div key={b.bookingId} className="rounded-[20px] border border-[#241B39] p-4 flex flex-col gap-2" style={{ background: 'var(--neon-surface-card-2)' }}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-bold text-[color:var(--neon-text-hi)]">{b.stationName} · {b.gameTypeName}</div>
                  <div className="text-sm text-[color:var(--neon-text-mid)]">
                    {new Date(b.scheduledStartAt).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
                <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded border border-[#241C3A] text-[color:var(--neon-text-lo)] shrink-0">
                  {t(`scheduling.status_${b.status}`)}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs text-[color:var(--neon-text-mid)]">
                <span className="font-mono">{b.referenceCode}</span>
                <span className="font-neon-display tabular-nums" style={{ color: 'var(--neon-cyan-lt)' }}>{formatMoney(b.amountCents)}</span>
              </div>
              <div className="text-xs font-bold" style={{ color: 'var(--neon-magenta-soft)' }}>
                {minutesUntil > 0
                  ? t('scheduling.inMinutes', { n: String(minutesUntil) })
                  : t('scheduling.startingNow')}
              </div>
              {canCancel && (
                <button
                  type="button"
                  disabled={cancellingId === b.bookingId}
                  onClick={() => handleCancel(b.bookingId)}
                  className="w-full rounded-xl border border-[#3A2F58] py-2 text-[13px] font-bold flex items-center justify-center gap-1.5 text-[color:var(--neon-text-mid)] hover:text-[color:var(--neon-text-hi)] transition-colors"
                >
                  {cancellingId === b.bookingId && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  {t('scheduling.cancelBooking')}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
