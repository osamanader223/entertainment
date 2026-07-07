import { requireAuth, userHasAnyRole } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { getServerDict } from '@/i18n/server';
import { formatMoney } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { DollarSign, Activity, Clock, Tag, Users } from 'lucide-react';
import type { LoyaltyTier } from '@/lib/loyalty';

export const metadata = { title: 'Admin — Home' };
export const dynamic = 'force-dynamic';

const DEMO_TENANT_ID = '11111111-1111-1111-1111-111111111111';
const ADMIN_ROLES = ['manager', 'tenant_admin'] as const;

type ActivityLogEntry = {
  id: string;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  actor_id: string | null;
  occurred_at: string;
};

export default async function AdminHomePage() {
  const ctx = await requireAuth('/login');
  if (!userHasAnyRole(ctx, [...ADMIN_ROLES]) && !ctx.isSuperAdmin) redirect('/dashboard');

  const { d } = await getServerDict();
  const admin = createAdminClient();

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayISO = todayStart.toISOString();

  const [
    { data: paymentsToday },
    { data: activeSessions },
    { data: queueToday },
    { data: activeOffers },
    { count: totalCustomers },
    { data: activityRaw },
    { data: loyaltyTiersRaw },
  ] = await Promise.all([
    admin
      .from('payments')
      .select('amount_cents')
      .eq('tenant_id', DEMO_TENANT_ID)
      .eq('status', 'captured')
      .gte('created_at', todayISO),
    admin
      .from('sessions')
      .select('id', { count: 'exact', head: false })
      .eq('tenant_id', DEMO_TENANT_ID)
      .in('status', ['active', 'paused']),
    admin
      .from('queue_tickets')
      .select('id', { count: 'exact', head: false })
      .eq('tenant_id', DEMO_TENANT_ID)
      .in('status', ['waiting', 'called'])
      .gte('created_at', todayISO),
    admin
      .from('offers')
      .select('id', { count: 'exact', head: false })
      .eq('tenant_id', DEMO_TENANT_ID)
      .eq('is_active', true),
    admin
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .neq('id', '00000000-0000-0000-0000-000000000000'),
    admin
      .from('activity_log')
      .select('id, action, entity_type, entity_id, actor_id, occurred_at')
      .eq('tenant_id', DEMO_TENANT_ID)
      .order('occurred_at', { ascending: false })
      .limit(15),
    admin
      .from('loyalty_accounts')
      .select('tier')
      .eq('tenant_id', DEMO_TENANT_ID),
  ]);

  const todayRevenueCents = (paymentsToday ?? []).reduce(
    (sum, p) => sum + ((p as unknown as { amount_cents: number }).amount_cents ?? 0),
    0,
  );
  const activeSessionsCount = (activeSessions ?? []).length;
  const queueCount = (queueToday ?? []).length;
  const activeOffersCount = (activeOffers ?? []).length;
  const customerCount = totalCustomers ?? 0;

  const activityLog = (activityRaw ?? []) as unknown as ActivityLogEntry[];

  const tierCounts: Record<LoyaltyTier, number> = { silver: 0, gold: 0, platinum: 0, diamond: 0 };
  for (const row of loyaltyTiersRaw ?? []) {
    const tier = (row as unknown as { tier: string }).tier;
    if (tier === 'vip') tierCounts.diamond += 1;
    else if (tier in tierCounts) tierCounts[tier as LoyaltyTier] += 1;
  }

  const stats = [
    { icon: DollarSign, label: d.admin.todayRevenue, value: formatMoney(todayRevenueCents), gold: true },
    { icon: Activity, label: d.admin.activeSessions, value: String(activeSessionsCount) },
    { icon: Clock, label: d.admin.queueNow, value: String(queueCount) },
    { icon: Tag, label: d.admin.activeOffers, value: String(activeOffersCount) },
    { icon: Users, label: d.admin.totalCustomers, value: String(customerCount) },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">{d.admin.title}</h1>
        <p className="text-muted-foreground mt-1">{d.admin.subtitle}</p>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {stats.map((s) => (
          <Card key={s.label} className={`glass ${s.gold ? 'border-gold-500/30' : ''}`}>
            <CardContent className="p-5">
              <div className="flex items-center gap-2 text-muted-foreground text-xs">
                <s.icon className={`h-4 w-4 ${s.gold ? 'text-gold-400' : ''}`} />
                {s.label}
              </div>
              <div className={`mt-3 text-2xl font-bold tabular-nums ${s.gold ? 'text-gradient-gold' : ''}`}>
                {s.value}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Loyalty tier breakdown */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold">{d.loyalty.tiersTitle}</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {(['silver', 'gold', 'platinum', 'diamond'] as const).map((tier) => (
            <Card key={tier} className="glass">
              <CardContent className="p-5">
                <div className="text-xs text-muted-foreground">{d.loyalty.tier[tier]}</div>
                <div className="mt-2 text-2xl font-bold tabular-nums">{tierCounts[tier]}</div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Recent activity */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold">{d.admin.recentActivity}</h2>
        {activityLog.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">{d.admin.noActivity}</p>
        ) : (
          <div className="space-y-1.5">
            {activityLog.map((entry) => (
              <div
                key={entry.id}
                className="flex items-center justify-between rounded-lg border border-border/40 bg-card/30 px-4 py-2.5"
              >
                <div className="flex items-center gap-3">
                  <span className="text-xs font-mono text-gold-400/80 bg-gold-500/10 px-2 py-0.5 rounded">
                    {entry.action}
                  </span>
                  {entry.entity_type && (
                    <span className="text-xs text-muted-foreground">{entry.entity_type}</span>
                  )}
                </div>
                <time className="text-xs text-muted-foreground tabular-nums">
                  {new Date(entry.occurred_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </time>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
