'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ArrowRight, Gamepad2, Trophy, Zap, BarChart3, MessageSquare, ShieldCheck } from 'lucide-react';
import { useT } from '@/i18n/context';
import { LanguageToggle } from '@/components/language-toggle';

export default function HomePage() {
  const { t } = useT();

  return (
    <main className="relative min-h-screen overflow-hidden">
      {/* Top-right language toggle */}
      <div className="absolute top-4 end-6 z-10">
        <LanguageToggle />
      </div>

      {/* Hero */}
      <section className="relative px-6 pt-24 pb-32 mx-auto max-w-6xl">
        <div className="text-center space-y-8">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full glass text-sm text-gold-400">
            <span className="h-2 w-2 rounded-full bg-gold-400 animate-pulse" />
            {t('landing.tagline')}
          </div>

          <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight">
            <span className="text-gradient-gold">BOLOS ALLEY</span>
            <br />
            <span className="text-white">{t('landing.heroSubtitle')}</span>
          </h1>

          <p className="max-w-2xl mx-auto text-lg text-muted-foreground leading-relaxed">
            {t('landing.heroDesc')}
          </p>

          <div className="flex items-center justify-center gap-4 pt-4">
            <Button size="xl" variant="gold" asChild>
              <Link href="/signup">
                {t('landing.getStarted')} <ArrowRight className="h-5 w-5" />
              </Link>
            </Button>
            <Button size="xl" variant="outline" asChild>
              <Link href="/login">{t('landing.signIn')}</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Feature grid */}
      <section className="px-6 pb-32 mx-auto max-w-6xl">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <Feature icon={<Gamepad2 className="h-7 w-7" />} title={t('landing.feature1Title')} body={t('landing.feature1Body')} />
          <Feature icon={<Zap className="h-7 w-7" />} title={t('landing.feature2Title')} body={t('landing.feature2Body')} />
          <Feature icon={<Trophy className="h-7 w-7" />} title={t('landing.feature3Title')} body={t('landing.feature3Body')} />
          <Feature icon={<MessageSquare className="h-7 w-7" />} title={t('landing.feature4Title')} body={t('landing.feature4Body')} />
          <Feature icon={<BarChart3 className="h-7 w-7" />} title={t('landing.feature5Title')} body={t('landing.feature5Body')} />
          <Feature icon={<ShieldCheck className="h-7 w-7" />} title={t('landing.feature6Title')} body={t('landing.feature6Body')} />
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/50 py-8 text-center text-sm text-muted-foreground">
        {t('landing.footer')} © {new Date().getFullYear()}
      </footer>
    </main>
  );
}

function Feature({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="glass rounded-xl p-6 hover:border-gold-500/30 transition-colors">
      <div className="inline-flex h-12 w-12 items-center justify-center rounded-lg bg-gold-500/10 text-gold-400 mb-4">
        {icon}
      </div>
      <h3 className="text-lg font-semibold text-white mb-2">{title}</h3>
      <p className="text-sm text-muted-foreground leading-relaxed">{body}</p>
    </div>
  );
}
