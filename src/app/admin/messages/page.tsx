import { requireAuth, userHasAnyRole } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { getServerDict } from '@/i18n/server';
import { listNotifications, getNotificationMonthStats } from '@/lib/notifications';
import { MessagesLog } from '@/components/admin/messages-log';

export const metadata = { title: 'Admin — Messages' };
export const dynamic = 'force-dynamic';

const DEMO_TENANT_ID = '11111111-1111-1111-1111-111111111111';
const ADMIN_ROLES = ['manager', 'tenant_admin'] as const;

export default async function AdminMessagesPage() {
  const ctx = await requireAuth('/login');
  if (!userHasAnyRole(ctx, [...ADMIN_ROLES]) && !ctx.isSuperAdmin) redirect('/dashboard');

  const { d } = await getServerDict();

  const [notifications, stats] = await Promise.all([
    listNotifications({ tenantId: DEMO_TENANT_ID }),
    getNotificationMonthStats(DEMO_TENANT_ID),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">{d.adminMessages.title}</h1>
        <p className="text-muted-foreground mt-1">{d.adminMessages.subtitle}</p>
      </div>
      <MessagesLog initialNotifications={notifications} initialStats={stats} />
    </div>
  );
}
