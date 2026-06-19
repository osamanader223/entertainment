'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useT } from '@/i18n/context';
import { formatMoney } from '@/lib/utils';
import type { PricingRuleRow } from '@/lib/pricing-admin';
import { PricingForm } from './pricing-form';
import {
  createPricingRuleAction,
  updatePricingRuleAction,
  togglePricingRuleActiveAction,
  deletePricingRuleAction,
} from '@/app/admin/pricing/actions';
import { Plus, Pencil, Trash2, ToggleLeft, ToggleRight } from 'lucide-react';

interface PricingManagerProps {
  initialRules: PricingRuleRow[];
  gameTypes: Array<{ id: string; display_name_en: string; display_name_ar: string }>;
}

export function PricingManager({ initialRules, gameTypes }: PricingManagerProps) {
  const { t, locale } = useT();
  const [rules, setRules] = useState<PricingRuleRow[]>(initialRules);
  const [editRule, setEditRule] = useState<PricingRuleRow | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [, startTransition] = useTransition();

  const refresh = () => {
    startTransition(async () => {
      const { listPricingRulesAction } = await import('@/app/admin/pricing/actions');
      const res = await listPricingRulesAction();
      if (res.ok) setRules(res.rules);
    });
  };

  const handleToggle = (rule: PricingRuleRow) => {
    startTransition(async () => {
      const res = await togglePricingRuleActiveAction(rule.id, !rule.is_active);
      if (res.ok) { toast.success(t('admin.ruleToggled')); refresh(); }
      else toast.error(res.error);
    });
  };

  const handleDelete = (rule: PricingRuleRow) => {
    if (!window.confirm(t('admin.deleteRuleConfirm'))) return;
    startTransition(async () => {
      const res = await deletePricingRuleAction(rule.id);
      if (res.ok) { toast.success(t('admin.ruleDeleted')); refresh(); }
      else toast.error(res.error);
    });
  };

  const handleSaveCreate = async (data: unknown) => {
    const res = await createPricingRuleAction(data);
    if (res.ok) { toast.success(t('admin.ruleSaved')); setShowCreate(false); refresh(); }
    else toast.error(res.error);
    return res.ok;
  };

  const handleSaveEdit = async (data: unknown) => {
    if (!editRule) return false;
    const res = await updatePricingRuleAction(editRule.id, data);
    if (res.ok) { toast.success(t('admin.ruleSaved')); setEditRule(null); refresh(); }
    else toast.error(res.error);
    return res.ok;
  };

  const unitLabel = (unit: string): string => {
    const map: Record<string, string> = {
      per_minute: t('admin.unitPerMinute'),
      per_hour: t('admin.unitPerHour'),
      per_session: t('admin.unitPerSession'),
      per_player_hour: t('admin.unitPerPlayerHour'),
    };
    return map[unit] ?? unit;
  };

  const scheduleLabel = (rule: PricingRuleRow): string => {
    const parts: string[] = [];
    if (rule.days_of_week?.length) {
      const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      parts.push(rule.days_of_week.map((d) => dayNames[d] ?? d).join(', '));
    }
    if (rule.starts_at_time && rule.ends_at_time) {
      parts.push(`${rule.starts_at_time}–${rule.ends_at_time}`);
    }
    return parts.join(' · ') || '—';
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button variant="gold" onClick={() => setShowCreate(true)}>
          <Plus className="h-4 w-4" />
          {t('admin.createRule')}
        </Button>
      </div>

      {(showCreate || editRule) && (
        <PricingForm
          mode={showCreate ? 'create' : 'edit'}
          initial={editRule ?? undefined}
          gameTypes={gameTypes}
          onSave={showCreate ? handleSaveCreate : handleSaveEdit}
          onCancel={() => { setShowCreate(false); setEditRule(null); }}
        />
      )}

      {rules.length === 0 ? (
        <p className="text-sm text-muted-foreground py-6 text-center">{t('admin.noRules')}</p>
      ) : (
        <div className="rounded-xl border border-border/60 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 text-muted-foreground text-xs uppercase tracking-wide">
              <tr>
                <th className="px-4 py-3 text-start">{t('admin.ruleGameType')}</th>
                <th className="px-4 py-3 text-start">{t('admin.ruleName')}</th>
                <th className="px-4 py-3 text-start">{t('admin.ruleUnit')}</th>
                <th className="px-4 py-3 text-start">{t('admin.ruleAmount')}</th>
                <th className="px-4 py-3 text-start">{t('admin.ruleSchedule')}</th>
                <th className="px-4 py-3 text-start">{t('admin.rulePriority')}</th>
                <th className="px-4 py-3 text-start">Status</th>
                <th className="px-4 py-3 text-end">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {rules.map((rule) => (
                <tr key={rule.id} className="hover:bg-muted/10 transition-colors">
                  <td className="px-4 py-3 font-medium">
                    {locale === 'ar' ? rule.game_type_name_ar : rule.game_type_name_en}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{rule.name}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{unitLabel(rule.unit)}</td>
                  <td className="px-4 py-3 font-semibold text-gold-400">{formatMoney(rule.amount_cents)}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{scheduleLabel(rule)}</td>
                  <td className="px-4 py-3 font-mono text-xs">{rule.priority}</td>
                  <td className="px-4 py-3">
                    <Badge variant={rule.is_active ? 'default' : 'secondary'} className={rule.is_active ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : ''}>
                      {rule.is_active ? t('admin.statusActive') : t('admin.statusInactive')}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1.5">
                      <Button variant="ghost" size="icon" onClick={() => setEditRule(rule)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleToggle(rule)}>
                        {rule.is_active
                          ? <ToggleRight className="h-3.5 w-3.5 text-emerald-400" />
                          : <ToggleLeft className="h-3.5 w-3.5 text-muted-foreground" />}
                      </Button>
                      <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" onClick={() => handleDelete(rule)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
