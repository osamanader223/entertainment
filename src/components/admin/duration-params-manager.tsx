'use client';

import { useMemo, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useT } from '@/i18n/context';
import type { GameDurationParamsRow } from '@/lib/pricing-admin';
import { upsertGameDurationParamsAction } from '@/app/admin/pricing/actions';

const SLOT_MINUTES = 30;
const PREVIEW_PLAYERS = 4;
const PREVIEW_GAMES = 2;

// TODO(learning-engine): once enough sessions have actual_duration_minutes,
// fit these coefficients from real data instead of manual tuning here.
function previewDuration(baseMinutes: number, minutesPerPlayerPerGame: number, minMinutes: number, maxMinutes: number): number {
  const predicted = baseMinutes + PREVIEW_PLAYERS * PREVIEW_GAMES * minutesPerPlayerPerGame;
  const clamped = Math.min(maxMinutes, Math.max(minMinutes, predicted));
  return Math.ceil(clamped / SLOT_MINUTES) * SLOT_MINUTES;
}

interface DurationParamsManagerProps {
  initialRows: GameDurationParamsRow[];
}

export function DurationParamsManager({ initialRows }: DurationParamsManagerProps) {
  const { t, locale } = useT();
  const [rows, setRows] = useState(initialRows);

  if (rows.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t('admin.durationParamsTitle')}</CardTitle>
        <p className="text-sm text-muted-foreground mt-1">{t('admin.durationParamsSubtitle')}</p>
      </CardHeader>
      <CardContent className="space-y-4">
        {rows.map((row) => (
          <DurationParamsRow
            key={row.gameTypeId}
            row={row}
            name={locale === 'ar' ? row.gameTypeNameAr : row.gameTypeNameEn}
            onSaved={(patch) => setRows((prev) => prev.map((r) => (r.gameTypeId === row.gameTypeId ? { ...r, ...patch } : r)))}
          />
        ))}
      </CardContent>
    </Card>
  );
}

function DurationParamsRow({
  row,
  name,
  onSaved,
}: {
  row: GameDurationParamsRow;
  name: string;
  onSaved: (patch: Partial<GameDurationParamsRow>) => void;
}) {
  const { t } = useT();
  const [pending, startTransition] = useTransition();
  const [baseMinutes, setBaseMinutes] = useState(String(row.baseMinutes));
  const [perPlayerPerGame, setPerPlayerPerGame] = useState(String(row.minutesPerPlayerPerGame));
  const [minMinutes, setMinMinutes] = useState(String(row.minMinutes));
  const [maxMinutes, setMaxMinutes] = useState(String(row.maxMinutes));

  const preview = useMemo(() => {
    const base = Number.parseFloat(baseMinutes);
    const perGame = Number.parseFloat(perPlayerPerGame);
    const min = Number.parseInt(minMinutes, 10);
    const max = Number.parseInt(maxMinutes, 10);
    if (![base, perGame, min, max].every(Number.isFinite)) return null;
    return previewDuration(base, perGame, min, max);
  }, [baseMinutes, perPlayerPerGame, minMinutes, maxMinutes]);

  const handleSave = () => {
    const base = Number.parseFloat(baseMinutes);
    const perGame = Number.parseFloat(perPlayerPerGame);
    const min = Number.parseInt(minMinutes, 10);
    const max = Number.parseInt(maxMinutes, 10);
    if (![base, perGame, min, max].every(Number.isFinite)) {
      toast.error(t('admin.durationParamsInvalid'));
      return;
    }
    if (min > max) {
      toast.error(t('admin.durationParamsMinMax'));
      return;
    }
    startTransition(async () => {
      const res = await upsertGameDurationParamsAction({
        gameTypeId: row.gameTypeId,
        baseMinutes: base,
        minutesPerPlayerPerGame: perGame,
        minMinutes: min,
        maxMinutes: max,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(t('admin.ruleSaved'));
      onSaved({ baseMinutes: base, minutesPerPlayerPerGame: perGame, minMinutes: min, maxMinutes: max });
    });
  };

  return (
    <div className="rounded-xl border border-border/60 p-4 space-y-4">
      <div className="font-semibold">{name}</div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">{t('admin.baseMinutes')}</Label>
          <Input type="number" min={0} value={baseMinutes} onChange={(e) => setBaseMinutes(e.target.value)} className="h-10 font-mono" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">{t('admin.minutesPerPlayerPerGame')}</Label>
          <Input type="number" min={0} step={0.5} value={perPlayerPerGame} onChange={(e) => setPerPlayerPerGame(e.target.value)} className="h-10 font-mono" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">{t('admin.minMinutes')}</Label>
          <Input type="number" min={5} value={minMinutes} onChange={(e) => setMinMinutes(e.target.value)} className="h-10 font-mono" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">{t('admin.maxMinutes')}</Label>
          <Input type="number" min={5} value={maxMinutes} onChange={(e) => setMaxMinutes(e.target.value)} className="h-10 font-mono" />
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 flex-wrap">
        {preview !== null && (
          <p className="text-sm text-muted-foreground">
            {t('admin.durationPreview', { players: String(PREVIEW_PLAYERS), minutes: String(preview) })}
          </p>
        )}
        <Button variant="gold" size="sm" disabled={pending} onClick={handleSave}>
          {t('admin.save')}
        </Button>
      </div>
    </div>
  );
}
