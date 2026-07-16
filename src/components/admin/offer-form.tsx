'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useT } from '@/i18n/context';
import type { OfferRow } from '@/lib/offers';
import { Loader2 } from 'lucide-react';

type DiscountType = 'percent' | 'fixed' | 'free_minutes' | 'double_points';
type RedemptionType = 'code' | 'auto';

interface GameType {
  id: string;
  display_name_en: string;
  display_name_ar: string;
}

interface OfferFormProps {
  mode: 'create' | 'edit';
  initial?: OfferRow;
  gameTypes: GameType[];
  onSave: (data: unknown) => Promise<boolean>;
  onCancel: () => void;
}

export function OfferForm({ mode, initial, gameTypes, onSave, onCancel }: OfferFormProps) {
  const { t, locale } = useT();
  const [pending, setPending] = useState(false);

  const [nameEn, setNameEn] = useState(initial?.name ?? '');
  const [nameAr, setNameAr] = useState(initial?.description_ar ?? '');
  const [descEn, setDescEn] = useState(initial?.description_en ?? '');
  const [descAr, setDescAr] = useState(initial?.description_ar ?? '');
  const [code, setCode] = useState(initial?.code ?? '');
  const [discountType, setDiscountType] = useState<DiscountType>(initial?.discount_type ?? 'percent');
  const [discountValue, setDiscountValue] = useState(String(initial?.discount_value ?? ''));
  const [redemptionType, setRedemptionType] = useState<RedemptionType>(
    (initial?.redemption_type as RedemptionType) ?? 'code',
  );
  const [appliesToGameTypeId, setAppliesToGameTypeId] = useState(initial?.applies_to_game_type_id ?? '');
  const [minSpend, setMinSpend] = useState(
    initial?.min_amount_cents ? String(initial.min_amount_cents / 100) : '',
  );
  const [maxUses, setMaxUses] = useState(initial?.max_uses ? String(initial.max_uses) : '');
  const [maxUsesPerCustomer, setMaxUsesPerCustomer] = useState(
    initial?.max_uses_per_customer ? String(initial.max_uses_per_customer) : '',
  );
  const [minTier, setMinTier] = useState(initial?.min_tier ?? '');
  const [validFrom, setValidFrom] = useState(initial?.valid_from?.slice(0, 10) ?? '');
  const [validTo, setValidTo] = useState(initial?.valid_to?.slice(0, 10) ?? '');
  const [isActive, setIsActive] = useState(initial?.is_active ?? true);
  const [imageUrl, setImageUrl] = useState(initial?.image_url ?? '');

  const discountUnitHint = {
    percent: '%',
    fixed: 'SAR',
    free_minutes: t('admin.unitPerMinute'),
    double_points: '×',
  }[discountType];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Client-side guard: code required for code-based offers
    if (redemptionType === 'code' && !code.trim()) {
      alert(t('admin.offerCode') + ' is required');
      return;
    }
    setPending(true);
    try {
      const ok = await onSave({
        // auto offers send null so the DB stores NULL (no customer-facing code needed)
        code: redemptionType === 'code' ? code.trim().toUpperCase() : null,
        nameEn,
        nameAr,
        descriptionEn: descEn || null,
        descriptionAr: descAr || null,
        discountType,
        discountValue: Number(discountValue),
        redemptionType,
        appliesToGameTypeId: appliesToGameTypeId || null,
        minAmountCents: minSpend ? Math.round(Number(minSpend) * 100) : null,
        maxUses: maxUses ? Number(maxUses) : null,
        maxUsesPerCustomer: maxUsesPerCustomer ? Number(maxUsesPerCustomer) : null,
        minTier: minTier || null,
        validFrom: validFrom || null,
        validTo: validTo || null,
        isActive,
        imageUrl: imageUrl.trim() || null,
      });
      if (!ok) setPending(false);
    } catch {
      setPending(false);
    }
  };

  const title = mode === 'create' ? t('admin.createOffer') : t('admin.editOffer');

  // Suppress unused variable warning for locale
  void locale;

  return (
    <Card className="glass border-gold-500/20">
      <CardHeader>
        <CardTitle className="text-lg">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField label={t('admin.offerName')}>
              <Input value={nameEn} onChange={(e) => setNameEn(e.target.value)} required />
            </FormField>
            <FormField label={t('admin.offerNameAr')}>
              <Input value={nameAr} onChange={(e) => setNameAr(e.target.value)} dir="rtl" required />
            </FormField>
            <FormField label={t('admin.offerDescEn')}>
              <Input value={descEn} onChange={(e) => setDescEn(e.target.value)} />
            </FormField>
            <FormField label={t('admin.offerDescAr')}>
              <Input value={descAr} onChange={(e) => setDescAr(e.target.value)} dir="rtl" />
            </FormField>
          </div>

          {/* Redemption type */}
          <div className="space-y-2">
            <Label>{t('admin.redemptionType')}</Label>
            <div className="flex gap-4">
              {(['code', 'auto'] as RedemptionType[]).map((rt) => (
                <label key={rt} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="redemptionType"
                    value={rt}
                    checked={redemptionType === rt}
                    onChange={() => setRedemptionType(rt)}
                    className="accent-gold-400"
                  />
                  <span className="text-sm">{t(`admin.redemption${rt === 'code' ? 'Code' : 'Auto'}`)}</span>
                </label>
              ))}
            </div>
          </div>

          {redemptionType === 'code' && (
            <FormField label={t('admin.offerCode')}>
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="WELCOME10"
                className="font-mono uppercase"
                required
              />
            </FormField>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField label={t('admin.discountType')}>
              <select
                value={discountType}
                onChange={(e) => setDiscountType(e.target.value as DiscountType)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="percent">{t('admin.discountPercent')}</option>
                <option value="fixed">{t('admin.discountFixed')}</option>
                <option value="free_minutes">{t('admin.discountFreeMinutes')}</option>
                <option value="double_points">{t('admin.discountDoublePoints')}</option>
              </select>
            </FormField>
            <FormField label={`${t('admin.discountValue')} (${discountUnitHint})`}>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={discountValue}
                onChange={(e) => setDiscountValue(e.target.value)}
                required
              />
            </FormField>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField label={t('admin.appliesToGameType')}>
              <select
                value={appliesToGameTypeId}
                onChange={(e) => setAppliesToGameTypeId(e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="">{t('admin.allGames')}</option>
                {gameTypes.map((gt) => (
                  <option key={gt.id} value={gt.id}>
                    {locale === 'ar' ? gt.display_name_ar : gt.display_name_en}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label={t('admin.minTier')}>
              <select
                value={minTier}
                onChange={(e) => setMinTier(e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="">{t('admin.anyTier')}</option>
                <option value="silver">Silver</option>
                <option value="gold">Gold</option>
                <option value="platinum">Platinum</option>
                <option value="diamond">Diamond</option>
              </select>
            </FormField>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <FormField label={t('admin.minSpend')}>
              <Input type="number" min="0" step="0.01" value={minSpend} onChange={(e) => setMinSpend(e.target.value)} />
            </FormField>
            <FormField label={t('admin.maxUses')}>
              <Input type="number" min="1" step="1" value={maxUses} onChange={(e) => setMaxUses(e.target.value)} />
            </FormField>
            <FormField label={t('admin.maxUsesPerCustomer')}>
              <Input type="number" min="1" step="1" value={maxUsesPerCustomer} onChange={(e) => setMaxUsesPerCustomer(e.target.value)} />
            </FormField>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField label={t('admin.validFrom')}>
              <Input type="date" value={validFrom} onChange={(e) => setValidFrom(e.target.value)} />
            </FormField>
            <FormField label={t('admin.validTo')}>
              <Input type="date" value={validTo} onChange={(e) => setValidTo(e.target.value)} />
            </FormField>
          </div>

          <FormField label={t('admin.offerImageUrl')}>
            <Input
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              placeholder="https://…/offer.png"
            />
          </FormField>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="accent-gold-400 h-4 w-4"
            />
            <span className="text-sm">{t('admin.isActive')}</span>
          </label>

          <div className="flex gap-3 pt-2">
            <Button type="submit" variant="gold" disabled={pending} className="flex-1">
              {pending && <Loader2 className="h-4 w-4 animate-spin" />}
              {t('admin.save')}
            </Button>
            <Button type="button" variant="outline" onClick={onCancel}>
              {t('admin.cancel')}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
