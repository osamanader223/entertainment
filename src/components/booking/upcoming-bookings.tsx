'use client';

import { useCallback, useEffect, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { createClient } from '@/lib/supabase/client';
import { formatMoney, translateReason } from '@/lib/utils';
import { useT } from '@/i18n/context';
import type { CustomerUpcomingBooking } from '@/lib/booking';
import { getMyUpcomingBookingsAction, cancelMyBookingAction } from '@/app/(dashboard)/dashboard/book/actions';
import { CalendarClock, Loader2 } from 'lucide-react';

const NO_SHOW_CUTOFF_MINUTES = 10;

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
    <section className="space-y-3">
      <h2 className="text-xl font-semibold flex items-center gap-2">
        <CalendarClock className="h-5 w-5 text-gold-400" />
        {t('scheduling.upcomingBookings')}
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {bookings.map((b) => {
          const minutesUntil = Math.round((new Date(b.scheduledStartAt).getTime() - Date.now()) / 60_000);
          const canCancel = b.status === 'confirmed' && minutesUntil > NO_SHOW_CUTOFF_MINUTES;

          return (
            <Card key={b.bookingId} className="glass">
              <CardContent className="p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-semibold">{b.stationName} · {b.gameTypeName}</div>
                    <div className="text-sm text-muted-foreground">
                      {new Date(b.scheduledStartAt).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                  <span className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-muted/40 text-muted-foreground shrink-0">
                    {t(`scheduling.status_${b.status}`)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span className="font-mono">{b.referenceCode}</span>
                  <span>{formatMoney(b.amountCents)}</span>
                </div>
                <div className="text-xs text-gold-400">
                  {minutesUntil > 0
                    ? t('scheduling.inMinutes', { n: String(minutesUntil) })
                    : t('scheduling.startingNow')}
                </div>
                {canCancel && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full text-destructive hover:text-destructive"
                    disabled={cancellingId === b.bookingId}
                    onClick={() => handleCancel(b.bookingId)}
                  >
                    {cancellingId === b.bookingId && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    {t('scheduling.cancelBooking')}
                  </Button>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </section>
  );
}
