import { requireAuth, userHasAnyRole } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { getServerDict } from '@/i18n/server';
import { AnalyticsDashboard } from '@/components/admin/analytics-dashboard';
import {
  getKpiSummary,
  getRevenueByDay,
  getRevenueByMethod,
  getRevenueByGameType,
  getPeakHours,
  getTopCustomers,
} from '@/lib/analytics';

export const metadata = { title: 'Admin — Analytics' };
export const dynamic = 'force-dynamic';

const DEMO_TENANT_ID = '11111111-1111-1111-1111-111111111111';
const ADMIN_ROLES = ['manager', 'tenant_admin'] as const;

function toDateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export default async function AdminAnalyticsPage() {
  const ctx = await requireAuth('/login');
  if (!userHasAnyRole(ctx, [...ADMIN_ROLES]) && !ctx.isSuperAdmin) redirect('/dashboard');

  const { d } = await getServerDict();

  const today = new Date();
  const toDate = toDateKey(today);
  const from30 = new Date(today);
  from30.setDate(from30.getDate() - 29);
  const fromDate = toDateKey(from30);

  const [kpi, byDay, byMethod, byGameType, peakHours, topCustomers] = await Promise.all([
    getKpiSummary(DEMO_TENANT_ID, fromDate, toDate),
    getRevenueByDay(DEMO_TENANT_ID, fromDate, toDate),
    getRevenueByMethod(DEMO_TENANT_ID, fromDate, toDate),
    getRevenueByGameType(DEMO_TENANT_ID, fromDate, toDate),
    getPeakHours(DEMO_TENANT_ID, fromDate, toDate),
    getTopCustomers(DEMO_TENANT_ID, fromDate, toDate, 10),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">{d.adminAnalytics.title}</h1>
        <p className="text-muted-foreground mt-1">{d.adminAnalytics.subtitle}</p>
      </div>
      <AnalyticsDashboard
        initialFromDate={fromDate}
        initialToDate={toDate}
        initialData={{ kpi, byDay, byMethod, byGameType, peakHours, topCustomers }}
      />
    </div>
  );
}
