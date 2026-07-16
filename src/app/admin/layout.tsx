import { redirect } from 'next/navigation';
import { requireAuth, userHasAnyRole } from '@/lib/auth';
import { getServerDict } from '@/i18n/server';
import { AppNavShell } from '@/components/nav/app-nav-shell';
import {
  LayoutDashboard, Tag, DollarSign, Monitor, Users, BarChart3,
  Wallet, Settings, UserSquare2, MessageCircle,
} from 'lucide-react';

export const dynamic = 'force-dynamic';

const ADMIN_ROLES = ['manager', 'tenant_admin'] as const;
// Staff can see customers (they serve them) — every other admin section stays
// manager+ and is enforced independently by each page's own role check.
const SHELL_ROLES = ['staff', 'manager', 'tenant_admin'] as const;

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireAuth('/login');
  const isAdmin = userHasAnyRole(ctx, [...ADMIN_ROLES]) || ctx.isSuperAdmin;
  const canEnterShell = userHasAnyRole(ctx, [...SHELL_ROLES]) || ctx.isSuperAdmin;
  if (!canEnterShell) redirect('/dashboard');

  const { d } = await getServerDict();
  const userName = ctx.profile?.full_name || ctx.email || ctx.phone || 'Staff';

  const items = [
    { key: 'home', href: '/admin', label: d.admin.home, icon: LayoutDashboard, exact: true, staffVisible: false },
    { key: 'analytics', href: '/admin/analytics', label: d.admin.analytics, icon: BarChart3, staffVisible: false },
    { key: 'offers', href: '/admin/offers', label: d.admin.offers, icon: Tag, staffVisible: false },
    { key: 'pricing', href: '/admin/pricing', label: d.admin.pricing, icon: DollarSign, staffVisible: false },
    { key: 'stations', href: '/admin/stations', label: d.admin.stations, icon: Monitor, staffVisible: false },
    { key: 'staff', href: '/admin/staff', label: d.admin.staff, icon: Users, staffVisible: false },
    { key: 'wallet', href: '/admin/wallet', label: d.admin.wallet, icon: Wallet, staffVisible: false },
    { key: 'customers', href: '/admin/customers', label: d.admin.customers, icon: UserSquare2, staffVisible: true },
    { key: 'messages', href: '/admin/messages', label: d.admin.messages, icon: MessageCircle, staffVisible: false },
    { key: 'settings', href: '/admin/settings', label: d.admin.settings, icon: Settings, staffVisible: false },
  ].filter((item) => isAdmin || item.staffVisible);

  return (
    <AppNavShell
      items={items}
      userName={userName}
      adminBadge={d.admin.badge}
      backToAppHref="/dashboard"
      backToAppLabel={d.admin.backToApp}
    >
      {children}
    </AppNavShell>
  );
}
