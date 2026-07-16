import { redirect } from 'next/navigation';
import { requireAuth, userHasAnyRole } from '@/lib/auth';
import { getServerDict } from '@/i18n/server';
import { AppNavShell, type AppNavItem } from '@/components/nav/app-nav-shell';

const DEMO_BRANCH_CODE = 'JED-01';
const STAFF_ROLES = ['staff', 'manager', 'tenant_admin'] as const;
const ADMIN_ROLES = ['manager', 'tenant_admin'] as const;

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireAuth('/dashboard');

  // Hard gate: the cashier looks customers up by phone, so nobody gets past
  // this layout without one — mainly hits Google sign-ins (Google never
  // gives us a phone number). Re-checked on every load, so navigating away
  // mid-onboarding and coming back just lands here again until it's set.
  if (!ctx.profile?.phone) {
    redirect('/onboarding');
  }

  const userName = ctx.profile?.full_name || ctx.email || ctx.phone || 'Player';
  const { d } = await getServerDict();

  const isStaff = userHasAnyRole(ctx, [...STAFF_ROLES]) || ctx.isSuperAdmin;
  const isAdmin = userHasAnyRole(ctx, [...ADMIN_ROLES]) || ctx.isSuperAdmin;

  // icon is a string name (not a component) — components aren't serializable
  // across the server->client boundary. AppNavShell resolves the name itself.
  const items: AppNavItem[] = [
    { key: 'home', href: '/dashboard', label: d.dashboard.navHome, icon: 'home', exact: true },
    { key: 'bookings', href: '/dashboard/bookings', label: d.dashboard.navBookings, icon: 'bookings' },
    { key: 'wallet', href: '/dashboard/wallet', label: d.dashboard.navWallet, icon: 'wallet' },
    { key: 'profile', href: '/dashboard/profile', label: d.dashboard.navProfile, icon: 'profile' },
  ];

  if (isStaff) {
    items.push(
      { key: 'cashier', href: '/dashboard/cashier', label: d.nav.cashier, icon: 'cashier' },
      { key: 'customers', href: '/admin/customers', label: d.nav.customers, icon: 'customers' },
      { key: 'publicView', href: `/v/${DEMO_BRANCH_CODE}`, label: d.dashboard.publicView, icon: 'publicView' },
    );
  }

  if (isAdmin) {
    items.push({ key: 'admin', href: '/admin', label: d.admin.title, icon: 'adminHome' });
  }

  return (
    <AppNavShell items={items} userName={userName}>
      {children}
    </AppNavShell>
  );
}
