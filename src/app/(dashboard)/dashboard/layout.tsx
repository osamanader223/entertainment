import { requireAuth } from '@/lib/auth';
import { getServerDict } from '@/i18n/server';
import { AppNavShell, type AppNavItem } from '@/components/nav/app-nav-shell';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireAuth('/dashboard');
  const userName = ctx.profile?.full_name || ctx.email || ctx.phone || 'Player';
  const { d } = await getServerDict();

  // icon is a string name (not a component) — components aren't serializable
  // across the server->client boundary. AppNavShell resolves the name itself.
  const items: AppNavItem[] = [
    { key: 'home', href: '/dashboard', label: d.dashboard.navHome, icon: 'home', exact: true },
    { key: 'bookings', href: '/dashboard/bookings', label: d.dashboard.navBookings, icon: 'bookings' },
    { key: 'wallet', href: '/dashboard/wallet', label: d.dashboard.navWallet, icon: 'wallet' },
    { key: 'profile', href: '/dashboard/settings', label: d.dashboard.navProfile, icon: 'profile' },
  ];

  return (
    <AppNavShell items={items} userName={userName}>
      {children}
    </AppNavShell>
  );
}
