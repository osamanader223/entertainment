'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useT } from '@/i18n/context';
import { getWalletStateAction } from '@/app/(dashboard)/dashboard/wallet/actions';
import { formatMoney } from '@/lib/utils';
import { CheckCircle2, Loader2, XCircle } from 'lucide-react';

function CallbackContent() {
  const { t } = useT();
  const params = useSearchParams();
  const status = params.get('status');
  const message = params.get('message');

  const isPaid = status === 'paid';
  const isFailed = status === 'failed';

  const [creditConfirmed, setCreditConfirmed] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const [newBalance, setNewBalance] = useState<number | null>(null);
  const baselineRef = useRef<number | null>(null);
  const stoppedRef = useRef(false);

  useEffect(() => {
    if (!isPaid) return;
    stoppedRef.current = false;

    const poll = async () => {
      if (stoppedRef.current) return;
      const res = await getWalletStateAction();
      if (stoppedRef.current || res.balanceCents === undefined) return;

      if (baselineRef.current === null) {
        baselineRef.current = res.balanceCents;
      }

      setNewBalance(res.balanceCents);

      if (res.balanceCents > baselineRef.current) {
        setCreditConfirmed(true);
        stoppedRef.current = true;
      }
    };

    poll();
    const interval = setInterval(poll, 2000);
    const timeout = setTimeout(() => {
      stoppedRef.current = true;
      clearInterval(interval);
      setTimedOut(true);
    }, 30_000);

    return () => {
      stoppedRef.current = true;
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [isPaid]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center p-4">
      <Card className="w-full max-w-md glass">
        <CardContent className="p-8 text-center space-y-5">
          {isFailed ? (
            <>
              <XCircle className="h-14 w-14 text-destructive mx-auto" />
              <h1 className="text-xl font-bold">{t('wallet.paymentFailed')}</h1>
              {message && <p className="text-sm text-muted-foreground">{message}</p>}
              <p className="text-sm text-muted-foreground">{t('wallet.failBody')}</p>
              <Button variant="gold" asChild className="w-full">
                <Link href="/dashboard/wallet">{t('wallet.backToWallet')}</Link>
              </Button>
            </>
          ) : creditConfirmed ? (
            <>
              <CheckCircle2 className="h-14 w-14 text-emerald-400 mx-auto" />
              <h1 className="text-xl font-bold">{t('wallet.creditConfirmed')}</h1>
              {newBalance !== null && (
                <p className="text-3xl font-bold font-mono tabular-nums text-gradient-gold">
                  {formatMoney(newBalance)}
                </p>
              )}
              <Button variant="gold" asChild className="w-full">
                <Link href="/dashboard/wallet">{t('wallet.backToWallet')}</Link>
              </Button>
            </>
          ) : timedOut ? (
            <>
              <Loader2 className="h-14 w-14 text-muted-foreground mx-auto animate-spin" />
              <h1 className="text-xl font-bold">{t('wallet.successTitle')}</h1>
              <p className="text-sm text-muted-foreground">{t('wallet.successBody')}</p>
              <Button variant="gold" asChild className="w-full">
                <Link href="/dashboard/wallet">{t('wallet.backToWallet')}</Link>
              </Button>
            </>
          ) : (
            <>
              <Loader2 className="h-14 w-14 text-gold-400 mx-auto animate-spin" />
              <h1 className="text-xl font-bold">{t('wallet.waitingForCredit')}</h1>
              <p className="text-sm text-muted-foreground">{t('wallet.checkingPayment')}</p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function WalletCallbackPage() {
  return (
    <Suspense>
      <CallbackContent />
    </Suspense>
  );
}
