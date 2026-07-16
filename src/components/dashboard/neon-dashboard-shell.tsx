'use client';

// Responsive app shell for the neon-arcade dashboard redesign — bottom tab
// bar (phone), top nav (tablet), side nav (desktop). Renders ONLY on the
// /dashboard home route (DashboardHeader hides itself there instead) so
// every other dashboard sub-page keeps its existing header untouched.

import Image from 'next/image';
import Link from 'next/link';
import { Home, CalendarCheck, Wallet, User } from 'lucide-react';
import { useT } from '@/i18n/context';
import { cn } from '@/lib/utils';

interface NeonDashboardShellProps {
  userName: string;
  tierWord: string;
  children: React.ReactNode;
}

const NAV_ITEMS = [
  { key: 'home', href: '/dashboard', labelKey: 'dashboard.navHome', icon: Home, active: true },
  { key: 'bookings', href: '/dashboard/bookings', labelKey: 'dashboard.navBookings', icon: CalendarCheck, active: false },
  { key: 'wallet', href: '/dashboard/wallet', labelKey: 'dashboard.navWallet', icon: Wallet, active: false },
  { key: 'profile', href: '/dashboard/settings', labelKey: 'dashboard.navProfile', icon: User, active: false },
] as const;

export function NeonDashboardShell({ userName, tierWord, children }: NeonDashboardShellProps) {
  const { t, locale } = useT();
  const avatarLetter = locale === 'ar' ? 'أ' : (userName.trim()[0]?.toUpperCase() ?? '?');

  return (
    <div className="neon-theme -mx-6 -my-8 min-h-[calc(100vh-2rem)] flex flex-col md:flex-row bg-[color:var(--neon-bg-base)]" style={{ backgroundImage: 'var(--neon-canvas-glow)' }}>
      {/* Side nav — desktop only */}
      <aside className="hidden xl:flex flex-shrink-0 w-[230px] flex-col gap-1.5 py-6 px-4 border-e border-[#1C1730] bg-black/20">
        <div className="px-2 pb-5">
          <Image src="/images/bolos-logo.png" alt="Bolos Alley" width={150} height={40} className="w-[150px] h-auto drop-shadow-[0_0_16px_rgba(47,243,243,0.35)]" priority />
        </div>
        {NAV_ITEMS.map((item) => (
          <Link
            key={item.key}
            href={item.href}
            className={cn(
              'flex items-center gap-3.5 rounded-[14px] px-4 py-3.5 text-[15px] font-bold transition-colors',
              item.active
                ? 'bg-[linear-gradient(135deg,rgba(255,45,158,.16),rgba(123,47,247,.16))] border border-[rgba(255,45,158,.25)] text-[color:var(--neon-text-hi)]'
                : 'border border-transparent text-[color:var(--neon-text-mid)] hover:text-[color:var(--neon-text-hi)]',
            )}
          >
            <item.icon className="h-[22px] w-[22px] shrink-0" />
            {t(item.labelKey)}
          </Link>
        ))}
        <div className="mt-auto flex items-center gap-2.5 pt-3 border-t border-[#1C1730] px-2.5">
          <div className="h-[38px] w-[38px] rounded-full bg-[linear-gradient(135deg,#FF2D9E,#7B2FF7)] flex items-center justify-center text-white font-bold shrink-0">
            {avatarLetter}
          </div>
          <div className="leading-tight min-w-0">
            <div className="text-[14px] font-bold text-[color:var(--neon-text-hi)] truncate">{userName}</div>
            <div className="text-xs text-[color:var(--neon-text-lo)] truncate">{tierWord}</div>
          </div>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        {/* Top nav — tablet only */}
        <div className="hidden md:flex xl:hidden flex-shrink-0 items-center justify-between px-7 py-4 border-b border-[#1C1730] bg-black/30 backdrop-blur-sm sticky top-0 z-20">
          <Image src="/images/bolos-logo.png" alt="Bolos Alley" width={46} height={46} className="h-[46px] w-auto drop-shadow-[0_0_14px_rgba(47,243,243,0.35)]" priority />
          <nav className="flex gap-1.5">
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.key}
                href={item.href}
                className={cn(
                  'inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-bold transition-colors border',
                  item.active
                    ? 'bg-[rgba(47,243,243,.10)] border-[rgba(47,243,243,.3)] text-[color:var(--neon-cyan-lt)]'
                    : 'border-transparent text-[color:var(--neon-text-mid)] hover:text-[color:var(--neon-text-hi)]',
                )}
              >
                <item.icon className="h-5 w-5" />
                {t(item.labelKey)}
              </Link>
            ))}
          </nav>
          <div className="h-10 w-10 rounded-full bg-[linear-gradient(135deg,#FF2D9E,#7B2FF7)] flex items-center justify-center text-white font-bold text-[15px]">
            {avatarLetter}
          </div>
        </div>

        {/* Content */}
        <main className="flex-1 min-h-0 pb-24 md:pb-10">
          <div className="max-w-[1080px] mx-auto px-5 sm:px-7 py-6 sm:py-7 flex flex-col gap-[22px] sm:gap-[26px]">
            {children}
          </div>
        </main>
      </div>

      {/* Bottom tab bar — phone only */}
      <nav className="md:hidden fixed inset-x-0 bottom-0 z-30 flex items-stretch justify-around border-t border-[#1C1730] bg-black/90 backdrop-blur-md px-2 pt-2.5" style={{ paddingBottom: 'calc(10px + env(safe-area-inset-bottom))' }}>
        {NAV_ITEMS.map((item) => (
          <Link
            key={item.key}
            href={item.href}
            className={cn(
              'flex-1 flex flex-col items-center gap-1.5 py-1.5 text-[11px] font-bold',
              item.active ? 'text-[color:var(--neon-cyan)]' : 'text-[color:var(--neon-text-lo)]',
            )}
          >
            <item.icon className="h-6 w-6" />
            {t(item.labelKey)}
          </Link>
        ))}
      </nav>
    </div>
  );
}
