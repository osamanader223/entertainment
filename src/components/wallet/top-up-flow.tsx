'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useT } from '@/i18n/context';
import { startTopUpAction } from '@/app/(dashboard)/dashboard/wallet/actions';
import { formatMoney } from '@/lib/utils';
import { ArrowLeft, Loader2 } from 'lucide-react';

declare global {
  interface Window {
    Moyasar?: {
      init: (config: Record<string, unknown>) => void;
    };
  }
}

// Preset top-up amounts in halalas (1 SAR = 100 halalas = our 'cents')
const PRESET_AMOUNTS = [2500, 5000, 10000, 20000] as const;

interface TopUpFlowProps {
  walletBalanceCents: number;
}

export function TopUpFlow({ walletBalanceCents }: TopUpFlowProps) {
  const { t } = useT();
  const [selectedAmount, setSelectedAmount] = useState<number | null>(null);
  const [step, setStep] = useState<'select' | 'form'>('select');
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [formConfig, setFormConfig] = useState<{
    publishableKey: string;
    internalPaymentId: string;
    amountCents: number;
  } | null>(null);
  const formInitialized = useRef(false);

  // Load Moyasar JS and initialize the embedded form once we have config
  useEffect(() => {
    if (step !== 'form' || !formConfig || formInitialized.current) return;

    const initForm = () => {
      if (!window.Moyasar) return;
      formInitialized.current = true;
      window.Moyasar.init({
        element: '.mysr-form',
        amount: formConfig.amountCents,
        currency: 'SAR',
        description: t('wallet.topUpDescription'),
        publishable_api_key: formConfig.publishableKey,
        callback_url: `${window.location.origin}/dashboard/wallet/callback`,
        methods: ['creditcard'],
        metadata: { internal_payment_id: formConfig.internalPaymentId },
      });
    };

    if (window.Moyasar) {
      initForm();
    } else {
      const script = document.createElement('script');
      script.src = 'https://cdn.moyasar.com/mpf/1.14.0/moyasar.js';
      script.onload = initForm;
      document.head.appendChild(script);
    }
  }, [step, formConfig, t]);

  const handleStartTopUp = () => {
    if (!selectedAmount) return;
    setError(null);
    formInitialized.current = false;
    startTransition(async () => {
      const res = await startTopUpAction({ amountCents: selectedAmount });
      if (res.error) {
        setError(res.error);
        return;
      }
      setFormConfig({
        publishableKey: res.publishableKey!,
        internalPaymentId: res.internalPaymentId!,
        amountCents: selectedAmount,
      });
      setStep('form');
    });
  };

  const handleBack = () => {
    setStep('select');
    setFormConfig(null);
    formInitialized.current = false;
  };

  if (step === 'form' && formConfig) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>{t('wallet.topUpTitle')}</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">{formatMoney(formConfig.amountCents)}</p>
            </div>
            <Button variant="ghost" size="sm" onClick={handleBack}>
              <ArrowLeft className="h-4 w-4" />
              {t('common.back')}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {/* Moyasar CSS — React hoists <link> to <head> automatically */}
          <link rel="stylesheet" href="https://cdn.moyasar.com/mpf/1.14.0/moyasar.css" />
          <div className="mysr-form" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('wallet.topUpTitle')}</CardTitle>
        <p className="text-sm text-muted-foreground mt-1">
          {t('wallet.currentBalance')}:{' '}
          <span className="font-mono text-foreground">{formatMoney(walletBalanceCents)}</span>
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">{t('wallet.selectAmount')}</p>
        <div className="grid grid-cols-2 gap-3">
          {PRESET_AMOUNTS.map((amount) => (
            <Button
              key={amount}
              type="button"
              variant={selectedAmount === amount ? 'gold' : 'outline'}
              size="xl"
              onClick={() => setSelectedAmount(amount)}
            >
              {formatMoney(amount)}
            </Button>
          ))}
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <Button
          variant="gold"
          size="xl"
          className="w-full"
          disabled={!selectedAmount || pending}
          onClick={handleStartTopUp}
        >
          {pending && <Loader2 className="h-4 w-4 animate-spin" />}
          {t('wallet.topUpButton')}
        </Button>
      </CardContent>
    </Card>
  );
}
