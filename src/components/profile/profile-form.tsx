'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Loader2, Pencil } from 'lucide-react';

import { updateProfileAction } from '@/app/(dashboard)/dashboard/profile/actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn, formatMoney } from '@/lib/utils';
import { useT } from '@/i18n/context';
import type { LoyaltyTier } from '@/lib/loyalty';

interface ProfileFormProps {
  fullName: string;
  phone: string;
  email: string;
  preferredLocale: 'en' | 'ar';
  memberSince: string | null;
  tier: LoyaltyTier;
  tierName: string;
  pointsBalance: number;
  totalSpentCents: number;
}

export function ProfileForm({
  fullName,
  phone,
  email,
  preferredLocale,
  memberSince,
  tier,
  tierName,
  pointsBalance,
  totalSpentCents,
}: ProfileFormProps) {
  const { t, locale } = useT();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);

  const [nameInput, setNameInput] = useState(fullName);
  const [phoneInput, setPhoneInput] = useState(phone);
  const [localeInput, setLocaleInput] = useState<'en' | 'ar'>(preferredLocale);
  const [error, setError] = useState<string | null>(null);

  const startEdit = () => {
    setNameInput(fullName);
    setPhoneInput(phone);
    setLocaleInput(preferredLocale);
    setError(null);
    setEditing(true);
  };

  const cancelEdit = () => setEditing(false);

  const onSave = () => {
    setError(null);
    startTransition(async () => {
      const res = await updateProfileAction({ fullName: nameInput, phone: phoneInput, preferredLocale: localeInput });
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
      setEditing(false);
      router.refresh();
    });
  };

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-extrabold text-[color:var(--neon-text-hi)]">{t('profile.title')}</h1>
        <p className="text-sm text-[color:var(--neon-text-mid)] mt-1">{t('profile.subtitle')}</p>
      </div>

      {/* Loyalty & spend */}
      <div className="rounded-[20px] border border-[#241B39] p-5" style={{ background: 'var(--neon-surface-card-2)' }}>
        <div className="text-sm font-bold text-[color:var(--neon-text-mid)] mb-3">{t('profile.loyaltyAndSpend')}</div>
        <div className="grid grid-cols-3 gap-4">
          <Stat label={t('dashboard.tier')} value={tierName} />
          <Stat label={t('dashboard.loyaltyPoints')} value={pointsBalance.toLocaleString()} />
          <Stat label={t('profile.totalSpent')} value={formatMoney(totalSpentCents)} />
        </div>
      </div>

      {/* Account details */}
      <div className="rounded-[20px] border border-[#241B39]" style={{ background: 'var(--neon-surface-card-2)' }}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#241B39]">
          <span className="text-sm font-bold text-[color:var(--neon-text-mid)]">{t('profile.accountDetails')}</span>
          {!editing && (
            <button
              type="button"
              onClick={startEdit}
              className="inline-flex items-center gap-1.5 text-xs font-bold rounded-full border px-3 py-1.5"
              style={{ borderColor: '#241E36', color: 'var(--neon-cyan)', background: 'rgba(47,243,243,.06)' }}
            >
              <Pencil className="h-3.5 w-3.5" />
              {t('profile.edit')}
            </button>
          )}
        </div>

        {!editing ? (
          <div className="divide-y divide-[#241B39]">
            <Row label={t('profile.fullName')} value={fullName || t('profile.notSet')} />
            <Row label={t('profile.phone')} value={phone || t('profile.notSet')} />
            <Row label={t('profile.email')} value={email || t('profile.notSet')} />
            <Row label={t('profile.preferredLanguage')} value={preferredLocale === 'ar' ? t('profile.arabicOption') : t('profile.englishOption')} />
            {memberSince && <Row label={t('profile.memberSince')} value={memberSince} />}
          </div>
        ) : (
          <div className="p-5 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="profile-fullName">{t('profile.fullName')}</Label>
              <Input id="profile-fullName" value={nameInput} onChange={(e) => setNameInput(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="profile-phone">{t('profile.phone')}</Label>
              <Input id="profile-phone" type="tel" dir="ltr" value={phoneInput} onChange={(e) => setPhoneInput(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>{t('profile.email')}</Label>
              <Input value={email} disabled />
            </div>
            <div className="space-y-2">
              <Label>{t('profile.preferredLanguage')}</Label>
              <div className="flex gap-2">
                <LocaleOption active={localeInput === 'ar'} onClick={() => setLocaleInput('ar')} label={t('profile.arabicOption')} />
                <LocaleOption active={localeInput === 'en'} onClick={() => setLocaleInput('en')} label={t('profile.englishOption')} />
              </div>
            </div>

            {error && <p className="text-xs text-destructive">{error}</p>}

            <div className="flex gap-2 pt-2">
              <Button type="button" variant="gold" className="flex-1" disabled={pending} onClick={onSave}>
                {pending && <Loader2 className="h-4 w-4 animate-spin" />}
                {t('profile.save')}
              </Button>
              <Button type="button" variant="outline" className="flex-1" disabled={pending} onClick={cancelEdit}>
                {t('common.cancel')}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 px-5 py-4">
      <span className="text-sm text-[color:var(--neon-text-mid)]">{label}</span>
      <span className="text-sm font-bold text-[color:var(--neon-text-hi)] truncate">{value}</span>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="text-lg font-extrabold text-gradient-gold truncate">{value}</div>
      <div className="text-xs text-[color:var(--neon-text-lo)] mt-0.5 truncate">{label}</div>
    </div>
  );
}

function LocaleOption({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex-1 rounded-xl border px-3 py-2 text-sm font-bold transition-colors',
        active
          ? 'border-[rgba(47,243,243,.4)] bg-[rgba(47,243,243,.08)] text-[color:var(--neon-cyan-lt)]'
          : 'border-[#241E36] text-[color:var(--neon-text-mid)]'
      )}
    >
      {label}
    </button>
  );
}
