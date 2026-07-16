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
import { validateSignupAction } from '@/app/(auth)/signup/actions';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { useT } from '@/i18n/context';
import { GoogleIcon } from '@/components/auth/google-icon';

export function SignupForm() {
  const { t, locale } = useT();
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get('redirect') || '/dashboard';
  const supabase = createClient();
  const [pending, startTransition] = useTransition();

  const form = useForm<SignupInput>({
    resolver: zodResolver(signupSchema),
    mode: 'onChange',
    defaultValues: { fullName: '', email: '', phone: '', password: '' },
  });

  const onSubmit = (values: SignupInput) => {
    startTransition(async () => {
      // Server-side re-validation — the client already checked with the same
      // schema, but that alone isn't trusted for the values we actually save.
      const checked = await validateSignupAction(values);
      if (!checked.ok) {
        toast.error(checked.duplicatePhone ? t('auth.duplicatePhone') : t('auth.invalidEmail'));
        return;
      }
      const { fullName, email, phone, password } = checked.data;

      // phone is metadata-only, never top-level — a top-level `phone` makes
      // Supabase attempt SMS verification and throw an "Invalid path" error.
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: fullName, phone },
        },
      });

      if (error) {
        if (/already registered|already exists|user_already_exists/i.test(error.message)) {
          toast.error(t('auth.duplicateEmail'));
        } else {
          toast.error(error.message);
        }
        return;
      }

      // Supabase doesn't error for a duplicate email when autoconfirm is on —
      // it silently returns a user with an empty identities array instead.
      if (data.user && data.user.identities?.length === 0) {
        toast.error(t('auth.duplicateEmail'));
        return;
      }

      if (!data.session) {
        // Defensive fallback — shouldn't happen with email confirmation off.
        toast.success(t('auth.accountCreated'));
        router.push('/login');
        return;
      }

      // The handle_new_user trigger already created the profiles row (with
      // phone left null, since phone only ever traveled in metadata, and
      // full_name from metadata) — enrich it now that we have a session.
      if (data.user) {
        const { error: profileError } = await supabase
          .from('profiles')
          .update({ full_name: fullName, phone, preferred_locale: locale } as never)
          .eq('id', data.user.id);
        if (profileError) console.error('[signup] profile enrich error:', profileError);
      }

      toast.success(t('auth.welcomeToBolos'));
      router.push(redirectTo);
      router.refresh();
    });
  };

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
        <CardTitle className="text-3xl text-gradient-gold">{t('auth.signupTitle')}</CardTitle>
        <CardDescription>{t('auth.signupSubtitle')}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
            <div className="space-y-2">
              <Label htmlFor="fullName">{t('auth.fullName')}</Label>
              <Input id="fullName" placeholder="Ahmed Al-Saud" {...form.register('fullName')} />
              {form.formState.errors.fullName && (
                <p className="text-xs text-destructive">{t(form.formState.errors.fullName.message as string)}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">{t('auth.emailLabel')}</Label>
              <Input id="email" type="email" placeholder="you@example.com" {...form.register('email')} />
              {form.formState.errors.email && (
                <p className="text-xs text-destructive">{t(form.formState.errors.email.message as string)}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="phone">{t('auth.phoneSaudi')}</Label>
              <Input id="phone" type="tel" dir="ltr" placeholder="05XXXXXXXX" {...form.register('phone')} />
              {form.formState.errors.phone && (
                <p className="text-xs text-destructive">{t(form.formState.errors.phone.message as string)}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">{t('auth.passwordLabel')}</Label>
              <Input id="password" type="password" {...form.register('password')} />
              {form.formState.errors.password ? (
                <p className="text-xs text-destructive">{t(form.formState.errors.password.message as string)}</p>
              ) : (
                <p className="text-xs text-muted-foreground">{t('auth.passwordMinHint')}</p>
              )}
            </div>

            <Button type="submit" variant="gold" className="w-full" size="lg" disabled={pending}>
              {pending && <Loader2 className="h-4 w-4 animate-spin" />}
              {t('common.signUp')}
            </Button>
          </form>

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
            {t('auth.hasAccount')}{' '}
            <Link href="/login" className="text-gold-400 hover:underline font-medium">
              {t('auth.signInLink')}
            </Link>
          </p>
        </div>
      </CardContent>
    </>
  );
}
