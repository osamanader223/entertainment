import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireAuth, userHasAnyRole } from '@/lib/auth';
import { getServerDict } from '@/i18n/server';
import { LanguageToggle } from '@/components/language-toggle';
import { Button } from '@/components/ui/button';
import {
  LayoutDashboard, Tag, DollarSign, Monitor, Users, BarChart3,
  Wallet, Settings, ArrowLeft, LogOut, UserSquare2, MessageCircle,
} from 'lucide-react';

export const dynamic = 'force-dynamic';

const DEMO_TENANT_ID = '11111111-1111-1111-1111-111111111111';

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
  const userName = ctx.profile?.full_name || ctx.email || ctx.phone || null;

  const navItems = [
    { href: '/admin', label: d.admin.home, icon: LayoutDashboard, exact: true, staffVisible: false },
    { href: '/admin/analytics', label: d.admin.analytics, icon: BarChart3, staffVisible: false },
    { href: '/admin/customers', label: d.admin.customers, icon: UserSquare2, staffVisible: true },
    { href: '/admin/offers', label: d.admin.offers, icon: Tag, staffVisible: false },
    { href: '/admin/pricing', label: d.admin.pricing, icon: DollarSign, staffVisible: false },
    { href: '/admin/stations', label: d.admin.stations, icon: Monitor, staffVisible: false },
    { href: '/admin/staff', label: d.admin.staff, icon: Users, staffVisible: false },
    { href: '/admin/wallet', label: d.admin.wallet, icon: Wallet, staffVisible: false },
    { href: '/admin/messages', label: d.admin.messages, icon: MessageCircle, staffVisible: false },
    { href: '/admin/settings', label: d.admin.settings, icon: Settings, staffVisible: false },
  ].filter((item) => isAdmin || item.staffVisible);

  // Suppress unused variable warning
  void DEMO_TENANT_ID;

  return (
    <div className="min-h-screen flex flex-col">
      {/* Gold top accent border to differentiate admin from customer area */}
      <div className="h-1 bg-gradient-to-r from-gold-600 via-gold-400 to-gold-600" />

      <div className="flex flex-1">
        {/* Sidebar */}
        <aside className="w-56 shrink-0 border-e border-border/50 bg-card/60 flex flex-col sticky top-0 h-screen">
          {/* Brand + badge */}
          <div className="px-4 py-5 border-b border-border/50">
            <div className="flex items-center gap-2">
              <span className="text-base font-extrabold text-gradient-gold">BOLOS</span>
              <span className="text-[10px] font-bold tracking-widest px-1.5 py-0.5 rounded bg-gold-500/20 text-gold-400 border border-gold-500/30">
                {d.admin.badge}
              </span>
            </div>
            {userName && (
              <p className="text-xs text-muted-foreground mt-1 truncate">{userName}</p>
            )}
          </div>

          {/* Nav links */}
          <nav className="flex-1 px-3 py-4 space-y-1">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="flex items-center gap-3 px-3 py-2 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
              >
                <item.icon className="h-4 w-4 shrink-0" />
                {item.label}
              </Link>
            ))}
          </nav>

          {/* Bottom actions */}
          <div className="px-3 py-4 border-t border-border/50 space-y-1">
            <LanguageToggle />
            <Button variant="ghost" size="sm" className="w-full justify-start gap-2 text-muted-foreground" asChild>
              <Link href="/dashboard">
                <ArrowLeft className="h-4 w-4" />
                {d.admin.backToApp}
              </Link>
            </Button>
            <form action="/auth/signout" method="post">
              <Button type="submit" variant="ghost" size="sm" className="w-full justify-start gap-2 text-muted-foreground">
                <LogOut className="h-4 w-4" />
                {d.nav.signOut}
              </Button>
            </form>
          </div>
        </aside>

        {/* Main content */}
        <main className="flex-1 min-w-0 px-6 py-8">
          {children}
        </main>
      </div>
    </div>
  );
}
