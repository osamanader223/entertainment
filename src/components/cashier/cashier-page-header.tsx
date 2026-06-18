'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Ticket } from 'lucide-react';
import { useT } from '@/i18n/context';

export function CashierPageHeader() {
  const { t } = useT();
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-3xl font-bold">{t('cashier.title')}</h1>
        <p className="text-muted-foreground mt-1">{t('cashier.subtitle')}</p>
      </div>
      <Button variant="outline" asChild>
        <Link href="/dashboard/cashier/queue">
          <Ticket className="h-4 w-4" />
          {t('cashier.queueManagement')}
        </Link>
      </Button>
    </div>
  );
}
