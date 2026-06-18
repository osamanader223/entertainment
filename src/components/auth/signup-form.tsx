'use client';

import { useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';

import { createClient } from '@/lib/supabase/client';
import { signupSchema, type SignupInput } from '@/lib/validators/auth';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { useT } from '@/i18n/context';

export function SignupForm() {
  const { t } = useT();
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get('redirect') || '/dashboard';
  const supabase = createClient();
  const [pending, startTransition] = useTransition();

  const form = useForm<SignupInput>({
    resolver: zodResolver(signupSchema),
    defaultValues: {
      fullName: '',
      email: '',
      phone: '',
      password: '',
      confirmPassword: '',
      marketingConsent: false,
    },
  });

  const onSubmit = (values: SignupInput) => {
    startTransition(async () => {
      const { data, error } = await supabase.auth.signUp({
        email: values.email,
        password: values.password,
        options: {
          data: {
            full_name: values.fullName,
            phone: values.phone,
            marketing_whatsapp_consent: values.marketingConsent,
          },
        },
      });

      if (error) {
        console.error('[signup] supabase error:', {
          name: error.name,
          status: error.status,
          code: (error as any).code,
          message: error.message,
          full: error,
        });
        toast.error(`${error.name ?? 'Error'}: ${error.message}`);
        return;
      }

      if (data.user && !data.session) {
        toast.success(t('auth.accountCreated'));
        router.push('/login');
        return;
      }

      toast.success(t('auth.welcomeToBolos'));
      router.push(redirectTo);
      router.refresh();
    });
  };

  return (
    <>
      <CardHeader className="text-center space-y-2">
        <CardTitle className="text-3xl text-gradient-gold">{t('auth.signupTitle')}</CardTitle>
        <CardDescription>{t('auth.signupSubtitle')}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="fullName">{t('auth.fullName')}</Label>
            <Input id="fullName" placeholder="Ahmed Al-Saud" {...form.register('fullName')} />
            {form.formState.errors.fullName && (
              <p className="text-xs text-destructive">{form.formState.errors.fullName.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">{t('auth.emailLabel')}</Label>
            <Input id="email" type="email" placeholder="you@example.com" {...form.register('email')} />
            {form.formState.errors.email && (
              <p className="text-xs text-destructive">{form.formState.errors.email.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="phone">{t('auth.phoneSaudi')}</Label>
            <Input id="phone" type="tel" dir="ltr" placeholder="+966 5X XXX XXXX" {...form.register('phone')} />
            {form.formState.errors.phone && (
              <p className="text-xs text-destructive">{form.formState.errors.phone.message}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="password">{t('auth.passwordLabel')}</Label>
              <Input id="password" type="password" {...form.register('password')} />
              {form.formState.errors.password && (
                <p className="text-xs text-destructive">{form.formState.errors.password.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">{t('auth.confirmPassword')}</Label>
              <Input id="confirmPassword" type="password" {...form.register('confirmPassword')} />
              {form.formState.errors.confirmPassword && (
                <p className="text-xs text-destructive">{form.formState.errors.confirmPassword.message}</p>
              )}
            </div>
          </div>

          <label className="flex items-start gap-2 text-sm text-muted-foreground cursor-pointer pt-2">
            <input
              type="checkbox"
              className="mt-1 h-4 w-4 rounded border-border accent-gold-500"
              {...form.register('marketingConsent')}
            />
            <span>{t('auth.marketingConsent')}</span>
          </label>

          <Button type="submit" variant="gold" className="w-full" size="lg" disabled={pending}>
            {pending && <Loader2 className="h-4 w-4 animate-spin" />}
            {t('common.signUp')}
          </Button>

          <p className="text-center text-sm text-muted-foreground">
            {t('auth.hasAccount')}{' '}
            <Link href="/login" className="text-gold-400 hover:underline font-medium">
              {t('auth.signInLink')}
            </Link>
          </p>
        </form>
      </CardContent>
    </>
  );
}
