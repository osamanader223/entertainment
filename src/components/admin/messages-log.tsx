'use client';

import { useState, useTransition } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { useT } from '@/i18n/context';
import type { NotificationLogRow, NotificationMonthStats } from '@/lib/notifications';
import { listNotificationsAction } from '@/app/admin/messages/actions';
import { Loader2, MessageCircle, CheckCheck, XCircle, Gift } from 'lucide-react';

const STATUS_BADGE: Record<string, string> = {
  queued: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  sent: 'bg-cyan-400/15 text-cyan-300 border-cyan-400/30',
  delivered: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  read: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  failed: 'bg-rose-500/15 text-rose-400 border-rose-500/30',
};

const TEMPLATE_CODES = [
  'queue_you_are_next',
  'queue_almost_your_turn',
  'booking_confirmed',
  'session_ending_soon',
  'session_ended_points',
];

interface MessagesLogProps {
  initialNotifications: NotificationLogRow[];
  initialStats: NotificationMonthStats;
}

export function MessagesLog({ initialNotifications, initialStats }: MessagesLogProps) {
  const { t } = useT();
  const [notifications, setNotifications] = useState(initialNotifications);
  const [statusFilter, setStatusFilter] = useState('');
  const [templateFilter, setTemplateFilter] = useState('');
  const [pending, startPending] = useTransition();

  const applyFilters = (nextStatus: string, nextTemplate: string) => {
    setStatusFilter(nextStatus);
    setTemplateFilter(nextTemplate);
    startPending(async () => {
      const res = await listNotificationsAction({
        statusFilter: nextStatus || undefined,
        templateFilter: nextTemplate || undefined,
      });
      if (res.ok) setNotifications(res.notifications);
    });
  };

  return (
    <div className="space-y-6">
      {/* Monthly stats */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard icon={MessageCircle} label={t('adminMessages.totalSent')} value={initialStats.totalSent} gold />
        <StatCard icon={CheckCheck} label={t('adminMessages.delivered')} value={initialStats.delivered} />
        <StatCard icon={XCircle} label={t('adminMessages.failed')} value={initialStats.failed} />
        <StatCard icon={Gift} label={t('adminMessages.free')} value={initialStats.free} />
        <StatCard icon={MessageCircle} label={t('adminMessages.paid')} value={initialStats.paid} />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={statusFilter}
          onChange={(e) => applyFilters(e.target.value, templateFilter)}
          className="flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <option value="">{t('adminMessages.allStatuses')}</option>
          <option value="queued">{t('adminMessages.statusQueued')}</option>
          <option value="sent">{t('adminMessages.statusSent')}</option>
          <option value="delivered">{t('adminMessages.statusDelivered')}</option>
          <option value="read">{t('adminMessages.statusRead')}</option>
          <option value="failed">{t('adminMessages.statusFailed')}</option>
        </select>
        <select
          value={templateFilter}
          onChange={(e) => applyFilters(statusFilter, e.target.value)}
          className="flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <option value="">{t('adminMessages.allTemplates')}</option>
          {TEMPLATE_CODES.map((code) => (
            <option key={code} value={code}>{code}</option>
          ))}
        </select>
        {pending && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
      </div>

      {/* Log table */}
      {notifications.length === 0 ? (
        <p className="text-sm text-muted-foreground py-10 text-center">{t('adminMessages.noMessages')}</p>
      ) : (
        <div className="rounded-xl border border-border/60 overflow-hidden overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 text-muted-foreground text-xs uppercase tracking-wide">
              <tr>
                <th className="px-4 py-3 text-start">{t('adminMessages.customer')}</th>
                <th className="px-4 py-3 text-start">{t('adminMessages.template')}</th>
                <th className="px-4 py-3 text-start">{t('adminMessages.status')}</th>
                <th className="px-4 py-3 text-start">{t('adminMessages.cost')}</th>
                <th className="px-4 py-3 text-end">{t('adminMessages.sentAt')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {notifications.map((n) => (
                <tr key={n.id} className="hover:bg-muted/10 transition-colors">
                  <td className="px-4 py-3">
                    <div className="font-medium">{n.customerName ?? '—'}</div>
                    <div className="text-xs text-muted-foreground font-mono">{n.customerPhone ?? ''}</div>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">{n.templateCode ?? '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase ${STATUS_BADGE[n.status] ?? STATUS_BADGE.queued}`}>
                      {n.status}
                    </span>
                    {n.status === 'failed' && n.error && (
                      <div className="text-[10px] text-rose-400 mt-1 max-w-xs truncate" title={n.error}>{n.error}</div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={n.wasFree ? 'text-emerald-400 text-xs' : 'text-muted-foreground text-xs'}>
                      {n.wasFree ? t('adminMessages.free') : t('adminMessages.paid')}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-end text-xs text-muted-foreground">
                    {n.sentAt ? new Date(n.sentAt).toLocaleString('en-US') : '—'}
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

function StatCard({ icon: Icon, label, value, gold }: { icon: typeof MessageCircle; label: string; value: number; gold?: boolean }) {
  return (
    <Card className={gold ? 'glass border-gold-500/30' : 'glass'}>
      <CardContent className="p-5">
        <div className="flex items-center gap-2 text-muted-foreground text-xs">
          <Icon className={`h-4 w-4 ${gold ? 'text-gold-400' : ''}`} />
          {label}
        </div>
        <div className={`mt-3 text-2xl font-bold tabular-nums ${gold ? 'text-gradient-gold' : ''}`}>
          {value.toLocaleString()}
        </div>
      </CardContent>
    </Card>
  );
}
