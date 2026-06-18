'use client';

import { Delete } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PhonePadProps {
  value: string;
  onChange: (value: string) => void;
  maxLength?: number;
  className?: string;
}

const DIGIT_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

const KEY_CLASS =
  'h-16 rounded-xl border border-border/60 bg-background text-2xl font-semibold tabular-nums transition-colors hover:bg-accent active:bg-accent/80';

export function PhonePad({ value, onChange, maxLength = 15, className }: PhonePadProps) {
  const append = (digit: string) => {
    if (value.length >= maxLength) return;
    onChange(value + digit);
  };

  return (
    <div className={cn('grid grid-cols-3 gap-2', className)}>
      {DIGIT_KEYS.map((key) => (
        <button key={key} type="button" onClick={() => append(key)} className={KEY_CLASS}>
          {key}
        </button>
      ))}

      <button
        type="button"
        onClick={() => onChange('')}
        className={cn(KEY_CLASS, 'text-sm font-medium text-muted-foreground')}
      >
        Clear
      </button>

      <button type="button" onClick={() => append('0')} className={KEY_CLASS}>
        0
      </button>

      <button
        type="button"
        onClick={() => onChange(value.slice(0, -1))}
        className={cn(KEY_CLASS, 'flex items-center justify-center')}
        aria-label="Backspace"
      >
        <Delete className="h-6 w-6" />
      </button>
    </div>
  );
}
