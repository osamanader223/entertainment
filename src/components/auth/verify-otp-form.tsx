'use client';

import { useTransition, useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';

import { createClient } from '@/lib/supabase/client';
import { verifyOtpSchema, type VerifyOtpInput } from '@/lib/validators/auth';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { useT } from '@/i18n/context';

export function VerifyOtpForm() {
  const { t } = useT();
  const router = useRouter();
  const searchParams = useSearchParams();
  const phone = searchParams.get('phone') ?? '';
  const redirectTo = searchParams.get('redirect') || '/dashboard';
  const supabase = createClient();
  const [pending, startTransition] = useTransition();
  const [resendCooldown, setResendCooldown] = useState(30);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setTimeout(() => setResendCooldown((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendCooldown]);

  const form = useForm<VerifyOtpInput>({
    resolver: zodResolver(verifyOtpSchema),
    defaultValues: { phone, token: '' },
  });

  const onSubmit = (values: VerifyOtpInput) => {
    startTransition(async () => {
      const { error } = await supabase.auth.verifyOtp({
        phone: values.phone,
        token: values.token,
        type: 'sms',
      });
      if (error) {
        toast.error(error.message);
        return;
      }
      toast.success(t('auth.phoneVerified'));
      router.push(redirectTo);
      router.refresh();
    });
  };

  const onResend = () => {
    startTransition(async () => {
      const { error } = await supabase.auth.signInWithOtp({
        phone,
        options: { channel: 'sms' },
      });
      if (error) {
        toast.error(error.message);
        return;
      }
      toast.success(t('auth.newCodeSent'));
      setResendCooldown(30);
    });
  };

  return (
    <>
      <CardHeader className="text-center space-y-2">
        <CardTitle className="text-3xl text-gradient-gold">{t('auth.verifyTitle')}</CardTitle>
        <CardDescription>{t('auth.verifySubtitle')}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="phone">{t('auth.phoneLabel')}</Label>
            <Input id="phone" dir="ltr" readOnly value={phone} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="token">{t('auth.sixDigitCode')}</Label>
            <Input
              id="token"
              dir="ltr"
              inputMode="numeric"
              maxLength={6}
              placeholder="123456"
              className="text-center text-2xl tracking-[0.5em] font-mono"
              {...form.register('token')}
            />
            {form.formState.errors.token && (
              <p className="text-xs text-destructive">{form.formState.errors.token.message}</p>
            )}
          </div>

          <Button type="submit" variant="gold" className="w-full" size="lg" disabled={pending}>
            {pending && <Loader2 className="h-4 w-4 animate-spin" />}
            {t('auth.verifyAndContinue')}
          </Button>

          <div className="text-center text-sm">
            {resendCooldown > 0 ? (
              <span className="text-muted-foreground">
                {t('auth.resendIn', { seconds: String(resendCooldown) })}
              </span>
            ) : (
              <button type="button" onClick={onResend} className="text-gold-400 hover:underline">
                {t('auth.resendCode')}
              </button>
            )}
          </div>
        </form>
      </CardContent>
    </>
  );
}
