'use client';

import { useState, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { Loader2, Phone, Mail } from 'lucide-react';

import { createClient } from '@/lib/supabase/client';
import {
  loginPhoneSchema,
  loginEmailSchema,
  type LoginPhoneInput,
  type LoginEmailInput,
} from '@/lib/validators/auth';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { useT } from '@/i18n/context';
import { GoogleIcon } from '@/components/auth/google-icon';

export function LoginForm() {
  const { t } = useT();
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get('redirect') || '/dashboard';
  const supabase = createClient();
  const [pending, startTransition] = useTransition();
  const [tab, setTab] = useState<'phone' | 'email'>('phone');

  // --- Phone OTP form ---
  const phoneForm = useForm<LoginPhoneInput>({
    resolver: zodResolver(loginPhoneSchema),
    defaultValues: { phone: '' },
  });

  const onSendOtp = (values: LoginPhoneInput) => {
    startTransition(async () => {
      const { error } = await supabase.auth.signInWithOtp({
        phone: values.phone,
        options: { channel: 'sms' },
      });
      if (error) {
        toast.error(error.message);
        return;
      }
      toast.success(t('auth.otpSent'));
      router.push(
        `/verify?phone=${encodeURIComponent(values.phone)}&redirect=${encodeURIComponent(redirectTo)}`
      );
    });
  };

  // --- Email/password form ---
  const emailForm = useForm<LoginEmailInput>({
    resolver: zodResolver(loginEmailSchema),
    defaultValues: { email: '', password: '' },
  });

  const onEmailSignIn = (values: LoginEmailInput) => {
    startTransition(async () => {
      const { error } = await supabase.auth.signInWithPassword(values);
      if (error) {
        toast.error(error.message);
        return;
      }
      toast.success(t('auth.signedIn'));
      router.push(redirectTo);
      router.refresh();
    });
  };

  // --- Google OAuth ---
  const onGoogle = () => {
    startTransition(async () => {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback?redirect=${encodeURIComponent(redirectTo)}`,
        },
      });
      if (error) toast.error(error.message);
    });
  };

  return (
    <>
      <CardHeader className="text-center space-y-2">
        <CardTitle className="text-3xl text-gradient-gold">{t('auth.loginTitle')}</CardTitle>
        <CardDescription>{t('auth.loginSubtitle')}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          <Tabs value={tab} onValueChange={(v) => setTab(v as 'phone' | 'email')}>
            <TabsList className="grid grid-cols-2 w-full">
              <TabsTrigger value="phone">
                <Phone className="h-4 w-4 me-2" /> {t('auth.phoneTab')}
              </TabsTrigger>
              <TabsTrigger value="email">
                <Mail className="h-4 w-4 me-2" /> {t('auth.emailTab')}
              </TabsTrigger>
            </TabsList>

            {/* Phone tab */}
            <TabsContent value="phone">
              <form onSubmit={phoneForm.handleSubmit(onSendOtp)} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="phone">{t('auth.phoneLabel')}</Label>
                  <Input
                    id="phone"
                    type="tel"
                    dir="ltr"
                    placeholder="+966 5X XXX XXXX"
                    {...phoneForm.register('phone')}
                  />
                  {phoneForm.formState.errors.phone && (
                    <p className="text-xs text-destructive">{phoneForm.formState.errors.phone.message}</p>
                  )}
                </div>
                <Button type="submit" variant="gold" className="w-full" size="lg" disabled={pending}>
                  {pending && <Loader2 className="h-4 w-4 animate-spin" />}
                  {t('auth.sendOtp')}
                </Button>
              </form>
            </TabsContent>

            {/* Email tab */}
            <TabsContent value="email">
              <form onSubmit={emailForm.handleSubmit(onEmailSignIn)} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">{t('auth.emailLabel')}</Label>
                  <Input id="email" type="email" placeholder="you@example.com" {...emailForm.register('email')} />
                  {emailForm.formState.errors.email && (
                    <p className="text-xs text-destructive">{emailForm.formState.errors.email.message}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <Label htmlFor="password">{t('auth.passwordLabel')}</Label>
                    <Link href="/forgot-password" className="text-xs text-gold-400 hover:underline">
                      {t('auth.forgotPassword')}
                    </Link>
                  </div>
                  <Input id="password" type="password" {...emailForm.register('password')} />
                  {emailForm.formState.errors.password && (
                    <p className="text-xs text-destructive">{emailForm.formState.errors.password.message}</p>
                  )}
                </div>
                <Button type="submit" variant="gold" className="w-full" size="lg" disabled={pending}>
                  {pending && <Loader2 className="h-4 w-4 animate-spin" />}
                  {t('auth.signIn')}
                </Button>
              </form>
            </TabsContent>
          </Tabs>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-border/60" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="bg-card px-3 text-muted-foreground">{t('common.or')}</span>
            </div>
          </div>

          <Button type="button" variant="outline" className="w-full" size="lg" onClick={onGoogle} disabled={pending}>
            <GoogleIcon /> {t('auth.continueGoogle')}
          </Button>

          <p className="text-center text-sm text-muted-foreground">
            {t('auth.noAccount')}{' '}
            <Link href="/signup" className="text-gold-400 hover:underline font-medium">
              {t('auth.createAccount')}
            </Link>
          </p>
        </div>
      </CardContent>
    </>
  );
}
