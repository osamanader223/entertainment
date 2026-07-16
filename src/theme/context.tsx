'use client';

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

export type Theme = 'light' | 'dark';

interface ThemeContextValue {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function applyThemeClass(theme: Theme) {
  document.documentElement.classList.toggle('poster-dark', theme === 'dark');
}

export function ThemeProvider({
  initialTheme,
  hasStoredPreference,
  children,
}: {
  initialTheme: Theme;
  /** Whether the theme came from a saved cookie — if not, we fall back to system preference once, client-side. */
  hasStoredPreference: boolean;
  children: ReactNode;
}) {
  const [theme, setThemeState] = useState<Theme>(initialTheme);

  useEffect(() => {
    applyThemeClass(theme);
  }, [theme]);

  useEffect(() => {
    if (hasStoredPreference) return;
    if (typeof window === 'undefined' || !window.matchMedia) return;
    if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
      setThemeState('dark');
    }
    // Only ever run this once, on mount, before any explicit user choice exists.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    try {
      localStorage.setItem('poster-theme', next);
    } catch {
      // storage unavailable
    }
    document.cookie = `poster-theme=${next};path=/;max-age=31536000;samesite=lax`;
    applyThemeClass(next);
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  }, [theme, setTheme]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
