'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useT } from '@/i18n/context';
import type { PricingRuleRow } from '@/lib/pricing-admin';
import { Loader2 } from 'lucide-react';

type PricingUnit = 'per_minute' | 'per_hour' | 'per_session' | 'per_player_hour';

interface GameType {
  id: string;
  display_name_en: string;
  display_name_ar: string;
}

interface PricingFormProps {
  mode: 'create' | 'edit';
  initial?: PricingRuleRow;
  gameTypes: GameType[];
  onSave: (data: unknown) => Promise<boolean>;
  onCancel: () => void;
}

export function PricingForm({ mode, initial, gameTypes, onSave, onCancel }: PricingFormProps) {
  const { t, locale } = useT();
  const [pending, setPending] = useState(false);

  const [gameTypeId, setGameTypeId] = useState(initial?.game_type_id ?? '');
  const [name, setName] = useState(initial?.name ?? '');
  const [unit, setUnit] = useState<PricingUnit>(initial?.unit ?? 'per_hour');
  const [amountSar, setAmountSar] = useState(
    initial?.amount_cents ? String(initial.amount_cents / 100) : '',
  );
  const [priority, setPriority] = useState(String(initial?.priority ?? 0));
  const [startsAtTime, setStartsAtTime] = useState(initial?.starts_at_time ?? '');
  const [endsAtTime, setEndsAtTime] = useState(initial?.ends_at_time ?? '');
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>(initial?.days_of_week ?? []);
  const [validFrom, setValidFrom] = useState(initial?.valid_from?.slice(0, 10) ?? '');
  const [validTo, setValidTo] = useState(initial?.valid_to?.slice(0, 10) ?? '');
  const [isActive, setIsActive] = useState(initial?.is_active ?? true);

  const toggleDay = (day: number) => {
    setDaysOfWeek((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day],
    );
  };

  const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPending(true);
    try {
      const ok = await onSave({
        gameTypeId,
        name,
        unit,
        amountSar: Number(amountSar),
        priority: Number(priority),
        startsAtTime: startsAtTime || null,
        endsAtTime: endsAtTime || null,
        daysOfWeek: daysOfWeek.length > 0 ? daysOfWeek : null,
        validFrom: validFrom || null,
        validTo: validTo || null,
        isActive,
      });
      if (!ok) setPending(false);
    } catch {
      setPending(false);
    }
  };

  return (
    <Card className="glass border-gold-500/20">
      <CardHeader>
        <CardTitle className="text-lg">
          {mode === 'create' ? t('admin.createRule') : t('admin.editRule')}
        </CardTitle>
        <p className="text-xs text-muted-foreground">{t('admin.priorityHint')}</p>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField label={t('admin.ruleGameType')}>
              <select
                value={gameTypeId}
                onChange={(e) => setGameTypeId(e.target.value)}
                required
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="">— select —</option>
                {gameTypes.map((gt) => (
                  <option key={gt.id} value={gt.id}>
                    {locale === 'ar' ? gt.display_name_ar : gt.display_name_en}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label={t('admin.ruleName')}>
              <Input value={name} onChange={(e) => setName(e.target.value)} required placeholder="Weekday Standard" />
            </FormField>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <FormField label={t('admin.ruleUnit')}>
              <select
                value={unit}
                onChange={(e) => setUnit(e.target.value as PricingUnit)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="per_hour">{t('admin.unitPerHour')}</option>
                <option value="per_minute">{t('admin.unitPerMinute')}</option>
                <option value="per_session">{t('admin.unitPerSession')}</option>
                <option value="per_player_hour">{t('admin.unitPerPlayerHour')}</option>
              </select>
            </FormField>
            <FormField label={t('admin.ruleAmount')}>
              <Input type="number" min="0" step="0.01" value={amountSar} onChange={(e) => setAmountSar(e.target.value)} required placeholder="50" />
            </FormField>
            <FormField label={t('admin.rulePriority')}>
              <Input type="number" min="0" max="999" step="1" value={priority} onChange={(e) => setPriority(e.target.value)} required />
            </FormField>
          </div>

          {/* Time window */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField label={t('admin.ruleTimeFrom')}>
              <Input type="time" value={startsAtTime} onChange={(e) => setStartsAtTime(e.target.value)} />
            </FormField>
            <FormField label={t('admin.ruleTimeTo')}>
              <Input type="time" value={endsAtTime} onChange={(e) => setEndsAtTime(e.target.value)} />
            </FormField>
          </div>

          {/* Days of week */}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">{t('admin.ruleDaysOfWeek')}</Label>
            <div className="flex gap-2 flex-wrap">
              {DAY_NAMES.map((day, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => toggleDay(idx)}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-colors ${
                    daysOfWeek.includes(idx)
                      ? 'bg-gold-500/20 border-gold-500/50 text-gold-400'
                      : 'border-border/60 text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {day}
                </button>
              ))}
            </div>
          </div>

          {/* Date range */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField label={t('admin.ruleValidFrom')}>
              <Input type="date" value={validFrom} onChange={(e) => setValidFrom(e.target.value)} />
            </FormField>
            <FormField label={t('admin.ruleValidTo')}>
              <Input type="date" value={validTo} onChange={(e) => setValidTo(e.target.value)} />
            </FormField>
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="accent-gold-400 h-4 w-4" />
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
