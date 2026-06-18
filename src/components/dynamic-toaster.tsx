'use client';

import { Toaster } from 'sonner';
import { useT } from '@/i18n/context';

export function DynamicToaster() {
  const { dir } = useT();
  return (
    <Toaster
      position={dir === 'rtl' ? 'bottom-left' : 'bottom-right'}
      theme="dark"
      richColors
      closeButton
    />
  );
}
