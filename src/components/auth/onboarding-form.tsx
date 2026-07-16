'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';

import { completeOnboardingAction } from '@/app/onboarding/actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { useT } from '@/i18n/context';

export function OnboardingForm({ initialFullName }: { initialFullName: string }) {
  const { t } = useT();
  const [pending, startTransition] = useTransition();
  const [fullName, setFullName] = useState(initialFullName);
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await completeOnboardingAction({ fullName, phone });
      if (!res.ok) {
        const message =
          res.error === 'duplicate_phone'
            ? t('auth.duplicatePhone')
            : res.error === 'invalid_phone'
              ? t('auth.invalidPhone')
              : res.error === 'invalid'
                ? t('auth.invalidFullName')
                : t('auth.invalidEmail');
        setError(message);
        toast.error(message);
        return;
      }
      toast.success(t('profile.saved'));
      // A hard navigation, not router.push — the client router can otherwise
      // reuse a cached "redirect to /onboarding" result from before this
      // profile update landed, bouncing the user right back to this page.
      window.location.href = '/dashboard';
    });
  };

  return (
    <>
      <CardHeader className="text-center space-y-2">
        <CardTitle className="text-3xl text-gradient-gold">{t('auth.onboardingTitle')}</CardTitle>
        <CardDescription>{t('auth.onboardingSubtitle')}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <div className="space-y-2">
            <Label htmlFor="fullName">{t('auth.fullName')}</Label>
            <Input id="fullName" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Ahmed Al-Saud" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="phone">{t('auth.phoneSaudi')}</Label>
            <Input id="phone" type="tel" dir="ltr" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="05XXXXXXXX" />
          </div>

          {error && <p className="text-xs text-destructive">{error}</p>}

          <Button type="submit" variant="gold" className="w-full" size="lg" disabled={pending}>
            {pending && <Loader2 className="h-4 w-4 animate-spin" />}
            {t('auth.completeProfile')}
          </Button>
        </form>
      </CardContent>
    </>
  );
}
