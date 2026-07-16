import { requireAuth } from '@/lib/auth';
import { getServerDict } from '@/i18n/server';
import { AppNavShell } from '@/components/nav/app-nav-shell';
import { Home, CalendarCheck, Wallet, User } from 'lucide-react';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireAuth('/dashboard');
  const userName = ctx.profile?.full_name || ctx.email || ctx.phone || 'Player';
  const { d } = await getServerDict();

  const items = [
    { key: 'home', href: '/dashboard', label: d.dashboard.navHome, icon: Home, exact: true },
    { key: 'bookings', href: '/dashboard/bookings', label: d.dashboard.navBookings, icon: CalendarCheck },
    { key: 'wallet', href: '/dashboard/wallet', label: d.dashboard.navWallet, icon: Wallet },
    { key: 'profile', href: '/dashboard/settings', label: d.dashboard.navProfile, icon: User },
  ];

  return (
    <AppNavShell items={items} userName={userName}>
      {children}
    </AppNavShell>
  );
}
