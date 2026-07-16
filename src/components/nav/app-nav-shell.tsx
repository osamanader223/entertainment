'use client';

// ONE shared responsive nav + content shell for the whole app — bottom tab
// bar (phone), top nav (tablet), side nav (desktop, leading side — right in
// RTL, left in LTR via logical properties). Used by both the customer
// dashboard layout and the admin layout; each supplies its own nav item
// list. See design_handoff_bolos_alley/README.md for the responsive spec.

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  ArrowLeft, LogOut, HelpCircle,
  Home, CalendarCheck, Wallet, User,
  LayoutDashboard, BarChart3, Tag, DollarSign, Monitor, Users, UserSquare2, MessageCircle, Settings,
  Banknote, Globe,
} from 'lucide-react';
import { useT } from '@/i18n/context';
import { cn } from '@/lib/utils';
import { LanguageToggle } from '@/components/language-toggle';

// Server Components can't pass component/function values across the
// server->client boundary (they're not serializable) — so layouts pass an
// icon NAME (string) instead, and this registry (which only ever lives in
// this client component) resolves it to the actual component at render time.
const ICONS = {
  home: Home,
  bookings: CalendarCheck,
  wallet: Wallet,
  profile: User,
  adminHome: LayoutDashboard,
  analytics: BarChart3,
  offers: Tag,
  pricing: DollarSign,
  stations: Monitor,
  staff: Users,
  customers: UserSquare2,
  messages: MessageCircle,
  settings: Settings,
  cashier: Banknote,
  publicView: Globe,
} as const;

export type NavIconName = keyof typeof ICONS;

export interface AppNavItem {
  key: string;
  href: string;
  label: string;
  icon: NavIconName;
  /** Exact match only (e.g. the home route) — otherwise active on any nested path under href. */
  exact?: boolean;
}

function NavIcon({ name, className }: { name: NavIconName; className?: string }) {
  const Icon = ICONS[name] ?? HelpCircle;
  return <Icon className={className} />;
}

interface AppNavShellProps {
  items: AppNavItem[];
  userName: string;
  subtitle?: string;
  /** Shows a small "ADMIN" chip in the side nav header. */
  adminBadge?: string;
  backToAppHref?: string;
  backToAppLabel?: string;
  children: React.ReactNode;
}

function useIsActive(pathname: string) {
  return (item: AppNavItem) => (item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(item.href + '/'));
}

export function AppNavShell({ items, userName, subtitle, adminBadge, backToAppHref, backToAppLabel, children }: AppNavShellProps) {
  const { t, locale } = useT();
  const pathname = usePathname();
  const isActive = useIsActive(pathname);
  const avatarLetter = locale === 'ar' ? 'أ' : (userName.trim()[0]?.toUpperCase() ?? '?');

  return (
    <div
      className="neon-theme min-h-screen flex flex-col md:flex-row bg-[color:var(--neon-bg-base)]"
      style={{ backgroundImage: 'var(--neon-canvas-glow)' }}
    >
      {/* Side nav — desktop only, leading side (right in RTL, left in LTR) */}
      <aside className="hidden xl:flex flex-shrink-0 w-[230px] flex-col gap-1.5 py-6 px-4 border-e border-[#1C1730] bg-black/20">
        <div className="px-2 pb-4 flex items-center gap-2">
          <Image src="/images/bolos-logo.png" alt="Bolos Alley" width={150} height={40} className="w-[130px] h-auto drop-shadow-[0_0_16px_rgba(47,243,243,0.35)]" priority />
          {adminBadge && (
            <span className="text-[10px] font-bold tracking-widest px-1.5 py-0.5 rounded bg-[rgba(47,243,243,.12)] text-[color:var(--neon-cyan)] border border-[rgba(47,243,243,.3)] shrink-0">
              {adminBadge}
            </span>
          )}
        </div>
        <div className="px-2 pb-3">
          <LanguageToggle />
        </div>
        <nav className="flex-1 flex flex-col gap-1.5 overflow-y-auto">
          {items.map((item) => {
            const active = isActive(item);
            return (
              <Link
                key={item.key}
                href={item.href}
                className={cn(
                  'flex items-center gap-3.5 rounded-[14px] px-4 py-3 text-[14px] font-bold transition-colors',
                  active
                    ? 'bg-[linear-gradient(135deg,rgba(255,45,158,.16),rgba(123,47,247,.16))] border border-[rgba(255,45,158,.25)] text-[color:var(--neon-text-hi)]'
                    : 'border border-transparent text-[color:var(--neon-text-mid)] hover:text-[color:var(--neon-text-hi)]',
                )}
              >
                <NavIcon name={item.icon} className="h-5 w-5 shrink-0" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        {backToAppHref && (
          <Link
            href={backToAppHref}
            className="flex items-center gap-3 rounded-[14px] px-4 py-3 text-[14px] font-bold text-[color:var(--neon-text-mid)] hover:text-[color:var(--neon-text-hi)] border border-transparent"
          >
            <ArrowLeft className="h-5 w-5 rtl:rotate-180 shrink-0" />
            {backToAppLabel}
          </Link>
        )}
        <div className="mt-2 flex items-center gap-2.5 pt-3 border-t border-[#1C1730] px-2.5">
          <div className="h-[38px] w-[38px] rounded-full bg-[linear-gradient(135deg,#FF2D9E,#7B2FF7)] flex items-center justify-center text-white font-bold shrink-0">
            {avatarLetter}
          </div>
          <div className="leading-tight min-w-0 flex-1">
            <div className="text-[14px] font-bold text-[color:var(--neon-text-hi)] truncate">{userName}</div>
            {subtitle && <div className="text-xs text-[color:var(--neon-text-lo)] truncate">{subtitle}</div>}
          </div>
          <form action="/auth/signout" method="post">
            <button type="submit" title={t('nav.signOut')} className="p-2 rounded-lg text-[color:var(--neon-text-lo)] hover:text-[color:var(--neon-text-hi)] hover:bg-white/5 shrink-0">
              <LogOut className="h-4 w-4" />
            </button>
          </form>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        {/* Top nav — tablet only */}
        <div className="hidden md:flex xl:hidden flex-shrink-0 items-center justify-between gap-3 px-7 py-4 border-b border-[#1C1730] bg-black/30 backdrop-blur-sm sticky top-0 z-20">
          <Image src="/images/bolos-logo.png" alt="Bolos Alley" width={46} height={46} className="h-[40px] w-auto shrink-0 drop-shadow-[0_0_14px_rgba(47,243,243,0.35)]" priority />
          <nav className="flex gap-1.5 overflow-x-auto">
            {items.map((item) => {
              const active = isActive(item);
              return (
                <Link
                  key={item.key}
                  href={item.href}
                  className={cn(
                    'inline-flex shrink-0 items-center gap-2 rounded-full px-3.5 py-2 text-sm font-bold transition-colors border whitespace-nowrap',
                    active
                      ? 'bg-[rgba(47,243,243,.10)] border-[rgba(47,243,243,.3)] text-[color:var(--neon-cyan-lt)]'
                      : 'border-transparent text-[color:var(--neon-text-mid)] hover:text-[color:var(--neon-text-hi)]',
                  )}
                >
                  <NavIcon name={item.icon} className="h-4.5 w-4.5" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <div className="flex items-center gap-2 shrink-0">
            <LanguageToggle />
            <div className="h-9 w-9 rounded-full bg-[linear-gradient(135deg,#FF2D9E,#7B2FF7)] flex items-center justify-center text-white font-bold text-[13px]">
              {avatarLetter}
            </div>
            <form action="/auth/signout" method="post">
              <button type="submit" title={t('nav.signOut')} className="p-2 rounded-lg text-[color:var(--neon-text-mid)] hover:text-[color:var(--neon-text-hi)] hover:bg-white/5">
                <LogOut className="h-4 w-4" />
              </button>
            </form>
          </div>
        </div>

        {/* Phone-only utility strip (language toggle + sign out) — top nav/side nav carry these above md */}
        <div className="md:hidden flex items-center justify-between px-5 py-3">
          <Image src="/images/bolos-logo.png" alt="Bolos Alley" width={110} height={30} className="h-[28px] w-auto drop-shadow-[0_0_12px_rgba(47,243,243,0.35)]" priority />
          <div className="flex items-center gap-1">
            <LanguageToggle />
            <form action="/auth/signout" method="post">
              <button type="submit" title={t('nav.signOut')} className="p-2 rounded-lg text-[color:var(--neon-text-mid)] hover:text-[color:var(--neon-text-hi)] hover:bg-white/5">
                <LogOut className="h-4 w-4" />
              </button>
            </form>
          </div>
        </div>

        {/* Content */}
        <main className="flex-1 min-h-0 pb-24 md:pb-10">
          <div className="max-w-[1080px] mx-auto px-5 sm:px-7 py-3 sm:py-7 flex flex-col gap-[22px] sm:gap-[26px]">
            {children}
          </div>
        </main>
      </div>

      {/* Bottom tab bar — phone only */}
      <nav className="md:hidden fixed inset-x-0 bottom-0 z-30 flex items-stretch justify-around overflow-x-auto border-t border-[#1C1730] bg-black/90 backdrop-blur-md px-1 pt-2.5" style={{ paddingBottom: 'calc(10px + env(safe-area-inset-bottom))' }}>
        {items.map((item) => {
          const active = isActive(item);
          return (
            <Link
              key={item.key}
              href={item.href}
              className={cn(
                'flex-1 min-w-[64px] flex flex-col items-center gap-1.5 py-1.5 text-[11px] font-bold',
                active ? 'text-[color:var(--neon-cyan)]' : 'text-[color:var(--neon-text-lo)]',
              )}
            >
              <NavIcon name={item.icon} className="h-6 w-6" />
              <span className="truncate max-w-[70px]">{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
