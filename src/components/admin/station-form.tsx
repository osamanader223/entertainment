'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useT } from '@/i18n/context';
import type { StationAdmin } from '@/lib/stations-admin';
import { Loader2 } from 'lucide-react';

interface StationFormProps {
  mode: 'create' | 'edit';
  initial?: StationAdmin;
  gameTypes: Array<{ id: string; display_name_en: string; display_name_ar: string; icon: string | null }>;
  onSave: (data: unknown) => Promise<boolean>;
  onCancel: () => void;
}

export function StationForm({ mode, initial, gameTypes, onSave, onCancel }: StationFormProps) {
  const { t, locale } = useT();
  const [pending, setPending] = useState(false);

  const [gameTypeId, setGameTypeId] = useState(initial?.gameTypeId ?? '');
  const [code, setCode] = useState(initial?.code ?? '');
  const [displayName, setDisplayName] = useState(initial?.displayName ?? '');
  const [iftttOn, setIftttOn] = useState(initial?.iftttEventOn ?? '');
  const [iftttOff, setIftttOff] = useState(initial?.iftttEventOff ?? '');
  const [iftttAlert, setIftttAlert] = useState(initial?.iftttEventAlert ?? '');
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [isActive, setIsActive] = useState(initial?.isActive ?? true);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPending(true);
    try {
      const ok = await onSave({
        gameTypeId,
        code: code.toUpperCase().trim(),
        displayName: displayName.trim(),
        iftttEventOn: iftttOn.trim() || null,
        iftttEventOff: iftttOff.trim() || null,
        iftttEventAlert: iftttAlert.trim() || null,
        notes: notes.trim() || null,
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
          {mode === 'create' ? t('adminStations.createStation') : t('adminStations.editStation')}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <FieldRow label={t('adminStations.code')}>
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="POOL-05"
                className="font-mono uppercase"
                required
              />
            </FieldRow>
            <FieldRow label={t('adminStations.name')}>
              <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} required />
            </FieldRow>
            <FieldRow label={t('adminStations.gameType')}>
              <select
                value={gameTypeId}
                onChange={(e) => setGameTypeId(e.target.value)}
                required
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="">— {t('adminStations.gameType')} —</option>
                {gameTypes.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.icon ? `${g.icon} ` : ''}{locale === 'ar' ? g.display_name_ar : g.display_name_en}
                  </option>
                ))}
              </select>
            </FieldRow>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">{t('adminStations.iftttHint')}</Label>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <FieldRow label={t('adminStations.iftttOn')}>
                <Input value={iftttOn} onChange={(e) => setIftttOn(e.target.value)} placeholder="Pool5_ON" className="font-mono" />
              </FieldRow>
              <FieldRow label={t('adminStations.iftttOff')}>
                <Input value={iftttOff} onChange={(e) => setIftttOff(e.target.value)} placeholder="Pool5_OFF" className="font-mono" />
              </FieldRow>
              <FieldRow label={t('adminStations.iftttAlert')}>
                <Input value={iftttAlert} onChange={(e) => setIftttAlert(e.target.value)} placeholder="Pool5_ALERT" className="font-mono" />
              </FieldRow>
            </div>
          </div>

          <FieldRow label={t('adminStations.notes')}>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
          </FieldRow>

          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="accent-gold-400 h-4 w-4" />
            <span className="text-sm">{t('admin.isActive')}</span>
          </label>

          <div className="flex gap-3 pt-2">
            <Button type="submit" variant="gold" disabled={pending} className="flex-1">
              {pending && <Loader2 className="h-4 w-4 animate-spin" />}
              {t('admin.save')}
            </Button>
            <Button type="button" variant="outline" onClick={onCancel}>{t('admin.cancel')}</Button>
          </div>
        </form>
      </CardContent>
    </Card>
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
