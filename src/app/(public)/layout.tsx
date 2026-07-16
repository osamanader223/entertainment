'use client';

import Link from 'next/link';
import { useT } from '@/i18n/context';
import { LanguageToggle } from '@/components/language-toggle';
import { ThemeToggle } from '@/components/theme-toggle';

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  const { t } = useT();

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-border/40 bg-card/30 backdrop-blur sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between">
          <Link href="/" className="text-base font-extrabold text-gradient-gold">
            BOLOS ALLEY
          </Link>
          <div className="flex items-center gap-3 text-sm">
            <ThemeToggle />
            <LanguageToggle />
            <Link href="/login" className="text-muted-foreground hover:text-foreground transition-colors">
              {t('venue.signIn')}
            </Link>
            <Link
              href="/signup"
              className="inline-flex items-center px-3 py-1.5 rounded-md bg-gold-500 text-black font-medium hover:bg-gold-400 transition-colors"
            >
              {t('venue.bookNow')}
            </Link>
          </div>
        </div>
      </header>
      <main className="flex-1">{children}</main>
    </div>
  );
}
