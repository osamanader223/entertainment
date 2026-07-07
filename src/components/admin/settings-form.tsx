'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useT } from '@/i18n/context';
import type { VenueSettings } from '@/lib/venue-settings';
import { updateTenantSettingsAction, updateBranchSettingsAction } from '@/app/admin/settings/actions';
import { Loader2 } from 'lucide-react';

interface SettingsFormProps {
  initialSettings: VenueSettings;
  canEditBranding: boolean;
}

export function SettingsForm({ initialSettings, canEditBranding }: SettingsFormProps) {
  const { t } = useT();

  // Venue identity
  const [displayName, setDisplayName] = useState(initialSettings.tenant.displayName);
  const [brandPrimaryColor, setBrandPrimaryColor] = useState(initialSettings.tenant.brandPrimaryColor ?? '#D4AF37');
  const [brandAccentColor, setBrandAccentColor] = useState(initialSettings.tenant.brandAccentColor ?? '#1E40AF');
  const [logoUrl, setLogoUrl] = useState(initialSettings.tenant.logoUrl ?? '');
  const [savingIdentity, setSavingIdentity] = useState(false);

  // Branch info + hours + queue policy
  const [branchName, setBranchName] = useState(initialSettings.branch.displayName);
  const [addressLine, setAddressLine] = useState(initialSettings.branch.addressLine ?? '');
  const [city, setCity] = useState(initialSettings.branch.city ?? '');
  const [phone, setPhone] = useState(initialSettings.branch.phone ?? '');
  const [whatsappNumber, setWhatsappNumber] = useState(initialSettings.branch.whatsappNumber ?? '');
  const [opensAt, setOpensAt] = useState(initialSettings.branch.opensAt.slice(0, 5));
  const [closesAt, setClosesAt] = useState(initialSettings.branch.closesAt.slice(0, 5));
  const [notificationWindow, setNotificationWindow] = useState(String(initialSettings.branch.queuePolicy.notification_window_minutes));
  const [maxWait, setMaxWait] = useState(String(initialSettings.branch.queuePolicy.max_wait_minutes));
  const [cancellationCredit, setCancellationCredit] = useState(String(initialSettings.branch.queuePolicy.cancellation_credit_percent));
  const [savingBranch, setSavingBranch] = useState(false);

  const saveIdentity = async () => {
    setSavingIdentity(true);
    const res = await updateTenantSettingsAction({
      displayName: displayName.trim(),
      brandPrimaryColor,
      brandAccentColor,
      logoUrl: logoUrl.trim() || null,
    });
    setSavingIdentity(false);
    if (res.ok) toast.success(t('adminSettings.saved'));
    else toast.error(res.error);
  };

  const saveBranch = async () => {
    setSavingBranch(true);
    const res = await updateBranchSettingsAction({
      displayName: branchName.trim(),
      addressLine: addressLine.trim() || null,
      city: city.trim() || null,
      phone: phone.trim() || null,
      whatsappNumber: whatsappNumber.trim() || null,
      opensAt: `${opensAt}:00`,
      closesAt: `${closesAt}:00`,
      queuePolicy: {
        notification_window_minutes: Number(notificationWindow) || 10,
        max_wait_minutes: Number(maxWait) || 90,
        cancellation_credit_percent: Number(cancellationCredit) || 100,
      },
    });
    setSavingBranch(false);
    if (res.ok) toast.success(t('adminSettings.saved'));
    else toast.error(res.error);
  };

  return (
    <div className="space-y-6">
      {/* Venue Identity */}
      <Card className="glass border-gold-500/20">
        <CardHeader>
          <CardTitle className="text-lg">{t('adminSettings.venueIdentity')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {!canEditBranding && (
            <p className="text-xs text-muted-foreground">{t('adminSettings.brandingReadOnly')}</p>
          )}
          <FieldRow label={t('adminSettings.venueName')}>
            <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} disabled={!canEditBranding} />
          </FieldRow>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FieldRow label={t('adminSettings.primaryColor')}>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={brandPrimaryColor}
                  onChange={(e) => setBrandPrimaryColor(e.target.value)}
                  disabled={!canEditBranding}
                  className="h-10 w-14 rounded-md border border-input bg-background disabled:opacity-50"
                />
                <Input value={brandPrimaryColor} onChange={(e) => setBrandPrimaryColor(e.target.value)} disabled={!canEditBranding} className="font-mono" dir="ltr" />
              </div>
            </FieldRow>
            <FieldRow label={t('adminSettings.accentColor')}>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={brandAccentColor}
                  onChange={(e) => setBrandAccentColor(e.target.value)}
                  disabled={!canEditBranding}
                  className="h-10 w-14 rounded-md border border-input bg-background disabled:opacity-50"
                />
                <Input value={brandAccentColor} onChange={(e) => setBrandAccentColor(e.target.value)} disabled={!canEditBranding} className="font-mono" dir="ltr" />
              </div>
            </FieldRow>
          </div>
          <p className="text-xs text-muted-foreground">{t('adminSettings.brandColorNote')}</p>
          <FieldRow label={t('adminSettings.logoUrl')}>
            <Input value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} disabled={!canEditBranding} placeholder="https://…" dir="ltr" />
          </FieldRow>
          <p className="text-xs text-muted-foreground">{t('adminSettings.logoUploadNote')}</p>

          {canEditBranding && (
            <Button variant="gold" disabled={savingIdentity} onClick={saveIdentity}>
              {savingIdentity && <Loader2 className="h-4 w-4 animate-spin" />}
              {t('adminSettings.saveIdentity')}
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Branch Info + Hours + Queue Policy */}
      <Card className="glass border-gold-500/20">
        <CardHeader>
          <CardTitle className="text-lg">{t('adminSettings.branchInfo')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <FieldRow label={t('adminSettings.branchName')}>
            <Input value={branchName} onChange={(e) => setBranchName(e.target.value)} />
          </FieldRow>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FieldRow label={t('adminSettings.addressLine')}>
              <Input value={addressLine} onChange={(e) => setAddressLine(e.target.value)} />
            </FieldRow>
            <FieldRow label={t('adminSettings.city')}>
              <Input value={city} onChange={(e) => setCity(e.target.value)} />
            </FieldRow>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FieldRow label={t('adminSettings.phone')}>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} dir="ltr" />
            </FieldRow>
            <FieldRow label={t('adminSettings.whatsappNumber')}>
              <Input value={whatsappNumber} onChange={(e) => setWhatsappNumber(e.target.value)} dir="ltr" />
            </FieldRow>
          </div>

          <div className="pt-2 border-t border-border/40">
            <h3 className="text-sm font-semibold text-muted-foreground mb-3 mt-3">{t('adminSettings.hours')}</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FieldRow label={t('adminSettings.opensAt')}>
                <Input type="time" value={opensAt} onChange={(e) => setOpensAt(e.target.value)} className="font-mono" />
              </FieldRow>
              <FieldRow label={t('adminSettings.closesAt')}>
                <Input type="time" value={closesAt} onChange={(e) => setClosesAt(e.target.value)} className="font-mono" />
              </FieldRow>
            </div>
          </div>

          <div className="pt-2 border-t border-border/40">
            <h3 className="text-sm font-semibold text-muted-foreground mb-3 mt-3">{t('adminSettings.queuePolicy')}</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <FieldRow label={t('adminSettings.notificationWindow')}>
                <Input type="number" min="1" max="120" value={notificationWindow} onChange={(e) => setNotificationWindow(e.target.value)} className="font-mono" />
              </FieldRow>
              <FieldRow label={t('adminSettings.maxWaitMinutes')}>
                <Input type="number" min="1" max="600" value={maxWait} onChange={(e) => setMaxWait(e.target.value)} className="font-mono" />
              </FieldRow>
              <FieldRow label={t('adminSettings.cancellationCredit')}>
                <Input type="number" min="0" max="100" value={cancellationCredit} onChange={(e) => setCancellationCredit(e.target.value)} className="font-mono" />
              </FieldRow>
            </div>
          </div>

          <Button variant="gold" disabled={savingBranch} onClick={saveBranch}>
            {savingBranch && <Loader2 className="h-4 w-4 animate-spin" />}
            {t('adminSettings.saveBranch')}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
