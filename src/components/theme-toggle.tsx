'use client';

import { Sun, Moon } from 'lucide-react';
import { useTheme } from '@/theme/context';
import { useT } from '@/i18n/context';
import { Button } from '@/components/ui/button';

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const { t } = useT();

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={toggleTheme}
      title={theme === 'dark' ? t('common.switchToLightMode') : t('common.switchToDarkMode')}
      aria-label={theme === 'dark' ? t('common.switchToLightMode') : t('common.switchToDarkMode')}
      className="font-semibold text-gold-400 hover:text-gold-300 hover:bg-gold-500/10"
    >
      {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </Button>
  );
}
