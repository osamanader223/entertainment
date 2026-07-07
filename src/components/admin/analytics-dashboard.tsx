'use client';

import { useState, useTransition } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useT } from '@/i18n/context';
import { formatMoney } from '@/lib/utils';
import { getAnalyticsAction } from '@/app/admin/analytics/actions';
import { DollarSign, Activity, Users, TrendingUp, UserPlus, Loader2 } from 'lucide-react';

interface Kpi {
  totalRevenueCents: number;
  totalSessions: number;
  uniqueCustomers: number;
  avgSessionValueCents: number;
  newCustomers: number;
}
interface ByDay { date: string; revenueCents: number; transactionCount: number }
interface ByMethod { method: string; revenueCents: number; count: number }
interface ByGameType { gameTypeName: string; gameTypeNameAr: string; revenueCents: number; sessionCount: number }
interface PeakHour { hour: number; sessionCount: number }
interface TopCustomer {
  customerId: string; fullName: string | null; phone: string | null;
  totalSpentCents: number; visitCount: number; tier: string;
}

interface AnalyticsData {
  kpi: Kpi;
  byDay: ByDay[];
  byMethod: ByMethod[];
  byGameType: ByGameType[];
  peakHours: PeakHour[];
  topCustomers: TopCustomer[];
}

interface AnalyticsDashboardProps {
  initialFromDate: string;
  initialToDate: string;
  initialData: AnalyticsData;
}

// Tailwind utility classes (for legend dots/bars) paired with their raw hex
// (conic-gradient() can't read Tailwind's bg-* utility classes directly).
const SERIES_COLORS = [
  { bar: 'bg-gold-400', dot: 'bg-gold-400', hex: '#DABF3B' },
  { bar: 'bg-emerald-400', dot: 'bg-emerald-400', hex: '#34D399' },
  { bar: 'bg-cyan-400', dot: 'bg-cyan-400', hex: '#22D3EE' },
  { bar: 'bg-violet-400', dot: 'bg-violet-400', hex: '#A78BFA' },
  { bar: 'bg-rose-400', dot: 'bg-rose-400', hex: '#FB7185' },
  { bar: 'bg-amber-400', dot: 'bg-amber-400', hex: '#FBBF24' },
];

const TIER_BADGE: Record<string, string> = {
  silver: 'bg-slate-400/15 text-slate-300 border-slate-400/30',
  gold: 'bg-gold-500/15 text-gold-400 border-gold-500/30',
  platinum: 'bg-cyan-400/15 text-cyan-300 border-cyan-400/30',
  diamond: 'bg-violet-400/15 text-violet-300 border-violet-400/30',
  vip: 'bg-violet-400/15 text-violet-300 border-violet-400/30',
};

function toDateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function shortDayLabel(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

export function AnalyticsDashboard({ initialFromDate, initialToDate, initialData }: AnalyticsDashboardProps) {
  const { t } = useT();
  const [fromDate, setFromDate] = useState(initialFromDate);
  const [toDate, setToDate] = useState(initialToDate);
  const [customFrom, setCustomFrom] = useState(initialFromDate);
  const [customTo, setCustomTo] = useState(initialToDate);
  const [data, setData] = useState<AnalyticsData>(initialData);
  const [activePreset, setActivePreset] = useState<'today' | '7d' | '30d' | 'month' | 'custom'>('30d');
  const [pending, startPending] = useTransition();

  const fetchRange = (from: string, to: string) => {
    startPending(async () => {
      const res = await getAnalyticsAction(from, to);
      if (res.ok) {
        setData({
          kpi: res.kpi,
          byDay: res.byDay,
          byMethod: res.byMethod,
          byGameType: res.byGameType,
          peakHours: res.peakHours,
          topCustomers: res.topCustomers,
        });
      }
    });
  };

  const applyPreset = (preset: 'today' | '7d' | '30d' | 'month') => {
    const today = new Date();
    let from: Date;
    if (preset === 'today') from = new Date(today);
    else if (preset === '7d') { from = new Date(today); from.setDate(from.getDate() - 6); }
    else if (preset === '30d') { from = new Date(today); from.setDate(from.getDate() - 29); }
    else from = new Date(today.getFullYear(), today.getMonth(), 1);

    const newFrom = toDateKey(from);
    const newTo = toDateKey(today);
    setActivePreset(preset);
    setFromDate(newFrom);
    setToDate(newTo);
    setCustomFrom(newFrom);
    setCustomTo(newTo);
    fetchRange(newFrom, newTo);
  };

  const applyCustomRange = () => {
    if (!customFrom || !customTo) return;
    setActivePreset('custom');
    setFromDate(customFrom);
    setToDate(customTo);
    fetchRange(customFrom, customTo);
  };

  const maxDayRevenue = Math.max(1, ...data.byDay.map((d) => d.revenueCents));
  const maxGameTypeRevenue = Math.max(1, ...data.byGameType.map((g) => g.revenueCents));
  const maxPeakCount = Math.max(1, ...data.peakHours.map((h) => h.sessionCount));
  const totalMethodRevenue = data.byMethod.reduce((s, m) => s + m.revenueCents, 0);

  // Conic-gradient stops for the donut chart
  let cumulative = 0;
  const donutStops = data.byMethod.map((m, i) => {
    const pct = totalMethodRevenue > 0 ? (m.revenueCents / totalMethodRevenue) * 100 : 0;
    const start = cumulative;
    cumulative += pct;
    const color = SERIES_COLORS[i % SERIES_COLORS.length];
    return { ...m, pct, start, end: cumulative, color };
  });
  const donutGradient = totalMethodRevenue > 0
    ? `conic-gradient(${donutStops.map((s) => `${s.color.hex} ${s.start}% ${s.end}%`).join(', ')})`
    : undefined;

  return (
    <div className="space-y-6">
      {/* Date range selector */}
      <div className="flex flex-wrap items-center gap-2">
        {(['today', '7d', '30d', 'month'] as const).map((preset) => (
          <Button
            key={preset}
            type="button"
            size="sm"
            variant={activePreset === preset ? 'gold' : 'outline'}
            disabled={pending}
            onClick={() => applyPreset(preset)}
          >
            {t(`adminAnalytics.preset_${preset}`)}
          </Button>
        ))}
        <div className="flex items-center gap-1.5 ms-2">
          <Input
            type="date"
            value={customFrom}
            onChange={(e) => setCustomFrom(e.target.value)}
            className="h-9 w-36 text-xs font-mono"
          />
          <span className="text-muted-foreground text-xs">–</span>
          <Input
            type="date"
            value={customTo}
            onChange={(e) => setCustomTo(e.target.value)}
            className="h-9 w-36 text-xs font-mono"
          />
          <Button type="button" size="sm" variant="outline" disabled={pending} onClick={applyCustomRange}>
            {t('adminAnalytics.applyRange')}
          </Button>
        </div>
        {pending && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <KpiCard icon={DollarSign} label={t('adminAnalytics.totalRevenue')} value={formatMoney(data.kpi.totalRevenueCents)} gold />
        <KpiCard icon={Activity} label={t('adminAnalytics.totalSessions')} value={data.kpi.totalSessions.toLocaleString()} />
        <KpiCard icon={Users} label={t('adminAnalytics.uniqueCustomers')} value={data.kpi.uniqueCustomers.toLocaleString()} />
        <KpiCard icon={TrendingUp} label={t('adminAnalytics.avgSessionValue')} value={formatMoney(data.kpi.avgSessionValueCents)} />
        <KpiCard icon={UserPlus} label={t('adminAnalytics.newCustomers')} value={data.kpi.newCustomers.toLocaleString()} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Revenue by day */}
        <Card className="glass">
          <CardContent className="p-5 space-y-3">
            <h3 className="text-sm font-semibold text-muted-foreground">{t('adminAnalytics.revenueByDay')}</h3>
            {data.byDay.every((d) => d.revenueCents === 0) ? (
              <EmptyState label={t('adminAnalytics.noData')} />
            ) : (
              <div className="space-y-2">
                <div className="flex items-end gap-1 h-40">
                  {data.byDay.map((d) => (
                    <div key={d.date} className="flex-1 flex flex-col items-center justify-end h-full group relative">
                      <div
                        className="w-full rounded-t bg-gold-400/80 group-hover:bg-gold-400 transition-colors min-h-[2px]"
                        style={{ height: `${Math.max(2, (d.revenueCents / maxDayRevenue) * 100)}%` }}
                        title={`${shortDayLabel(d.date)}: ${formatMoney(d.revenueCents)}`}
                      />
                    </div>
                  ))}
                </div>
                <div className="flex justify-between text-[10px] text-muted-foreground font-mono">
                  <span>{shortDayLabel(data.byDay[0]?.date ?? fromDate)}</span>
                  <span>{shortDayLabel(data.byDay[data.byDay.length - 1]?.date ?? toDate)}</span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Revenue by payment method */}
        <Card className="glass">
          <CardContent className="p-5 space-y-3">
            <h3 className="text-sm font-semibold text-muted-foreground">{t('adminAnalytics.revenueByMethod')}</h3>
            {data.byMethod.length === 0 ? (
              <EmptyState label={t('adminAnalytics.noData')} />
            ) : (
              <div className="flex items-center gap-6">
                <div
                  className="h-32 w-32 shrink-0 rounded-full"
                  style={{ background: donutGradient }}
                >
                  <div className="h-full w-full flex items-center justify-center">
                    <div className="h-20 w-20 rounded-full bg-card flex items-center justify-center text-xs font-semibold text-center px-1">
                      {formatMoney(totalMethodRevenue)}
                    </div>
                  </div>
                </div>
                <div className="space-y-1.5 flex-1 min-w-0">
                  {donutStops.map((s) => (
                    <div key={s.method} className="flex items-center justify-between gap-2 text-xs">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className={`h-2 w-2 rounded-full shrink-0 ${s.color.dot}`} />
                        <span className="truncate uppercase">{s.method}</span>
                      </div>
                      <span className="font-mono text-muted-foreground shrink-0">{Math.round(s.pct)}%</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Revenue by game type */}
        <Card className="glass">
          <CardContent className="p-5 space-y-3">
            <h3 className="text-sm font-semibold text-muted-foreground">{t('adminAnalytics.revenueByGameType')}</h3>
            {data.byGameType.length === 0 ? (
              <EmptyState label={t('adminAnalytics.noData')} />
            ) : (
              <div className="space-y-2.5">
                {data.byGameType.map((g, i) => {
                  const color = SERIES_COLORS[i % SERIES_COLORS.length];
                  return (
                    <div key={g.gameTypeName} className="space-y-1">
                      <div className="flex justify-between text-xs">
                        <span className="truncate">{g.gameTypeName}</span>
                        <span className="font-mono text-muted-foreground shrink-0">{formatMoney(g.revenueCents)}</span>
                      </div>
                      <div className="h-2 w-full rounded-full bg-muted/30 overflow-hidden">
                        <div
                          className={`h-full rounded-full ${color.bar}`}
                          style={{ width: `${Math.max(2, (g.revenueCents / maxGameTypeRevenue) * 100)}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Peak hours */}
        <Card className="glass">
          <CardContent className="p-5 space-y-3">
            <h3 className="text-sm font-semibold text-muted-foreground">{t('adminAnalytics.peakHours')}</h3>
            {data.peakHours.every((h) => h.sessionCount === 0) ? (
              <EmptyState label={t('adminAnalytics.noData')} />
            ) : (
              <div className="space-y-2">
                <div className="flex items-end gap-0.5 h-32">
                  {data.peakHours.map((h) => (
                    <div key={h.hour} className="flex-1 flex flex-col items-center justify-end h-full group">
                      <div
                        className="w-full rounded-t bg-cyan-400/70 group-hover:bg-cyan-400 transition-colors min-h-[2px]"
                        style={{ height: `${Math.max(2, (h.sessionCount / maxPeakCount) * 100)}%` }}
                        title={`${h.hour}:00 — ${h.sessionCount}`}
                      />
                    </div>
                  ))}
                </div>
                <div className="flex justify-between text-[10px] text-muted-foreground font-mono">
                  <span>0h</span>
                  <span>6h</span>
                  <span>12h</span>
                  <span>18h</span>
                  <span>23h</span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Top customers */}
      <Card className="glass">
        <CardContent className="p-5 space-y-3">
          <h3 className="text-sm font-semibold text-muted-foreground">{t('adminAnalytics.topCustomers')}</h3>
          {data.topCustomers.length === 0 ? (
            <EmptyState label={t('adminAnalytics.noData')} />
          ) : (
            <div className="rounded-lg border border-border/60 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/30 text-muted-foreground text-xs uppercase tracking-wide">
                  <tr>
                    <th className="px-4 py-2.5 text-start">{t('adminAnalytics.customer')}</th>
                    <th className="px-4 py-2.5 text-start">{t('adminAnalytics.tier')}</th>
                    <th className="px-4 py-2.5 text-end">{t('adminAnalytics.visits')}</th>
                    <th className="px-4 py-2.5 text-end">{t('adminAnalytics.totalSpent')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {data.topCustomers.map((c) => (
                    <tr key={c.customerId} className="hover:bg-muted/10 transition-colors">
                      <td className="px-4 py-2.5">
                        <div className="font-medium">{c.fullName ?? '—'}</div>
                        <div className="text-xs text-muted-foreground font-mono">{c.phone ?? ''}</div>
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase ${TIER_BADGE[c.tier] ?? TIER_BADGE.silver}`}>
                          {c.tier}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-end font-mono">{c.visitCount}</td>
                      <td className="px-4 py-2.5 text-end font-mono font-semibold text-gold-400">{formatMoney(c.totalSpentCents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function KpiCard({ icon: Icon, label, value, gold }: { icon: typeof DollarSign; label: string; value: string; gold?: boolean }) {
  return (
    <Card className={gold ? 'glass border-gold-500/30' : 'glass'}>
      <CardContent className="p-5">
        <div className="flex items-center gap-2 text-muted-foreground text-xs">
          <Icon className={`h-4 w-4 ${gold ? 'text-gold-400' : ''}`} />
          {label}
        </div>
        <div className={`mt-3 text-2xl font-bold tabular-nums ${gold ? 'text-gradient-gold' : ''}`}>{value}</div>
      </CardContent>
    </Card>
  );
}

function EmptyState({ label }: { label: string }) {
  return <p className="text-sm text-muted-foreground py-8 text-center">{label}</p>;
}
