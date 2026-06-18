'use client';

import { useT } from '@/i18n/context';
import { Button } from '@/components/ui/button';

export function LanguageToggle() {
  const { locale, setLocale } = useT();
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => setLocale(locale === 'ar' ? 'en' : 'ar')}
      className="font-semibold text-gold-400 hover:text-gold-300 hover:bg-gold-500/10"
    >
      {locale === 'ar' ? 'EN' : 'عربي'}
    </Button>
  );
}
