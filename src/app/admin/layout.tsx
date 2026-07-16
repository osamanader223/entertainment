import { redirect } from 'next/navigation';
import { requireAuth, userHasAnyRole } from '@/lib/auth';
import { getServerDict } from '@/i18n/server';
import { AppNavShell, type AppNavItem } from '@/components/nav/app-nav-shell';

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

  // icon is a string name (not a component) — components aren't serializable
  // across the server->client boundary. AppNavShell resolves the name itself.
  // (Typed directly on this literal, not after .filter() — contextual typing
  // doesn't flow through a chained call, so icon would otherwise widen to
  // `string` and no longer match the NavIconName union.)
  const allItems: Array<AppNavItem & { staffVisible: boolean }> = [
    { key: 'home', href: '/admin', label: d.admin.home, icon: 'adminHome', exact: true, staffVisible: false },
    { key: 'analytics', href: '/admin/analytics', label: d.admin.analytics, icon: 'analytics', staffVisible: false },
    { key: 'offers', href: '/admin/offers', label: d.admin.offers, icon: 'offers', staffVisible: false },
    { key: 'pricing', href: '/admin/pricing', label: d.admin.pricing, icon: 'pricing', staffVisible: false },
    { key: 'stations', href: '/admin/stations', label: d.admin.stations, icon: 'stations', staffVisible: false },
    { key: 'staff', href: '/admin/staff', label: d.admin.staff, icon: 'staff', staffVisible: false },
    { key: 'wallet', href: '/admin/wallet', label: d.admin.wallet, icon: 'wallet', staffVisible: false },
    { key: 'customers', href: '/admin/customers', label: d.admin.customers, icon: 'customers', staffVisible: true },
    { key: 'messages', href: '/admin/messages', label: d.admin.messages, icon: 'messages', staffVisible: false },
    { key: 'settings', href: '/admin/settings', label: d.admin.settings, icon: 'settings', staffVisible: false },
  ];
  const items = allItems.filter((item) => isAdmin || item.staffVisible);

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
