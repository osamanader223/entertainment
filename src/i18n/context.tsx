'use client';

import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { dictionaries, type Locale } from './dictionaries';

interface LocaleContextValue {
  locale: Locale;
  dir: 'ltr' | 'rtl';
  t: (path: string, vars?: Record<string, string>) => string;
  setLocale: (locale: Locale) => void;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function LocaleProvider({
  initialLocale,
  children,
}: {
  initialLocale: Locale;
  children: ReactNode;
}) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale);
  const dir = locale === 'ar' ? 'rtl' : 'ltr';

  const t = useCallback(
    (path: string, vars?: Record<string, string>): string => {
      const keys = path.split('.');
      let current: unknown = dictionaries[locale];
      for (const key of keys) {
        if (typeof current !== 'object' || current === null) return path;
        current = (current as Record<string, unknown>)[key];
      }
      if (typeof current !== 'string') return path;
      if (!vars) return current;
      return Object.entries(vars).reduce(
        (s, [k, v]) => s.replace(new RegExp(`\\{${k}\\}`, 'g'), v),
        current,
      );
    },
    [locale],
  );

  const setLocale = useCallback((newLocale: Locale) => {
    setLocaleState(newLocale);
    try {
      localStorage.setItem('locale', newLocale);
    } catch {
      // storage unavailable
    }
    document.cookie = `locale=${newLocale};path=/;max-age=31536000;samesite=lax`;
    document.documentElement.lang = newLocale;
    document.documentElement.dir = newLocale === 'ar' ? 'rtl' : 'ltr';
  }, []);

  return (
    <LocaleContext.Provider value={{ locale, dir, t, setLocale }}>
      {children}
    </LocaleContext.Provider>
  );
}

export function useT() {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error('useT must be used within LocaleProvider');
  return ctx;
}
