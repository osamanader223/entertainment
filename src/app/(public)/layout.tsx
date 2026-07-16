'use client';

import Link from 'next/link';
import { useT } from '@/i18n/context';
import { LanguageToggle } from '@/components/language-toggle';

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
            <LanguageToggle />
            <Link href="/login" className="text-muted-foreground hover:text-foreground transition-colors">
              {t('venue.signIn')}
            </Link>
            <Link
              href="/signup"
              className="inline-flex items-center px-4 py-1.5 rounded-lg text-white font-medium [background:linear-gradient(135deg,#FF2D9E,#7B2FF7)] shadow-[0_0_14px_-4px_rgba(255,45,158,.8)] hover:shadow-[0_0_18px_-2px_rgba(255,45,158,.9)] transition-shadow"
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
