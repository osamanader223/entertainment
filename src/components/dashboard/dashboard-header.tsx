'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { LogOut, LayoutDashboard, Calendar, Users, Settings, CreditCard, ShieldAlert } from 'lucide-react';
import { useT } from '@/i18n/context';
import { LanguageToggle } from '@/components/language-toggle';

interface DashboardHeaderProps {
  userName: string | null;
  isStaff: boolean;
  isAdmin?: boolean;
}

export function DashboardHeader({ userName, isStaff, isAdmin }: DashboardHeaderProps) {
  const { t } = useT();

  return (
    <header className="border-b border-border/50 bg-card/40 backdrop-blur-lg sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        <Link href="/dashboard" className="text-lg font-extrabold text-gradient-gold">
          BOLOS ALLEY OS
        </Link>

        <nav className="hidden md:flex items-center gap-1">
          <NavLink href="/dashboard" icon={<LayoutDashboard className="h-4 w-4" />}>
            {t('nav.overview')}
          </NavLink>
          <NavLink href="/dashboard/bookings" icon={<Calendar className="h-4 w-4" />}>
            {t('nav.bookings')}
          </NavLink>
          {isStaff && (
            <NavLink href="/dashboard/customers" icon={<Users className="h-4 w-4" />}>
              {t('nav.customers')}
            </NavLink>
          )}
          {isStaff && (
            <NavLink href="/dashboard/cashier" icon={<CreditCard className="h-4 w-4" />}>
              {t('nav.cashier')}
            </NavLink>
          )}
          <NavLink href="/dashboard/settings" icon={<Settings className="h-4 w-4" />}>
            {t('nav.settings')}
          </NavLink>
          {isAdmin && (
            <NavLink href="/admin" icon={<ShieldAlert className="h-4 w-4" />}>
              {t('admin.title')}
            </NavLink>
          )}
        </nav>

        <div className="flex items-center gap-3">
          <LanguageToggle />
          {userName && (
            <span className="hidden md:inline text-sm text-muted-foreground">{userName}</span>
          )}
          <form action="/auth/signout" method="post">
            <Button type="submit" variant="ghost" size="icon" title={t('nav.signOut')}>
              <LogOut className="h-4 w-4" />
            </Button>
          </form>
        </div>
      </div>
    </header>
  );
}

function NavLink({
  href,
  icon,
  children,
}: {
  href: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-2 px-3 py-2 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
    >
      {icon}
      {children}
    </Link>
  );
}
