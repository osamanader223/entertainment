'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Ticket, CalendarClock } from 'lucide-react';
import { useT } from '@/i18n/context';

export function CashierPageHeader({ upcomingReservationsCount }: { upcomingReservationsCount?: number }) {
  const { t } = useT();
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-3xl font-bold">{t('cashier.title')}</h1>
        <p className="text-muted-foreground mt-1">{t('cashier.subtitle')}</p>
      </div>
      <div className="flex gap-2">
        <Button variant="outline" asChild className="relative">
          <Link href="/dashboard/cashier/reservations">
            <CalendarClock className="h-4 w-4" />
            {t('scheduling.reservations')}
            {!!upcomingReservationsCount && (
              <span className="ms-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-gold-500 px-1 text-[10px] font-bold text-black">
                {upcomingReservationsCount}
              </span>
            )}
          </Link>
        </Button>
        <Button variant="outline" asChild>
          <Link href="/dashboard/cashier/queue">
            <Ticket className="h-4 w-4" />
            {t('cashier.queueManagement')}
          </Link>
        </Button>
      </div>
    </div>
  );
}
