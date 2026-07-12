import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Format halalas (integer cents) → "85.00 SAR" */
export function formatMoney(amountCents: number, currency = 'SAR', locale = 'en-SA') {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(amountCents / 100);
}

/** Seconds → "MM:SS" or "HH:MM:SS" */
export function formatDuration(totalSeconds: number) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
}

/** Parse + validate a phone number; returns E.164 or null */
export function normalizePhone(input: string, defaultCountry: CountryCode = 'SA'): string | null {
  if (!input) return null;
  const parsed = parsePhoneNumberFromString(input, defaultCountry);
  return parsed?.isValid() ? parsed.number : null;
}

/** Locale-aware date format */
export function formatDate(d: Date | string, locale = 'en-SA') {
  const date = typeof d === 'string' ? new Date(d) : d;
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Riyadh',
  }).format(date);
}

export const isRTL = (locale?: string) => (locale ?? 'ar').startsWith('ar');

/**
 * Translate a `${prefix}.${reason}` dictionary key, falling back to the raw
 * reason string if no translation exists. Needed because the `t()` helper
 * from useT() never returns a falsy value on a missing key — it returns the
 * constructed path itself — so a plain `t(key) || reason` fallback never
 * actually triggers.
 */
export function translateReason(
  t: (path: string, vars?: Record<string, string>) => string,
  prefix: string,
  reason: string
): string {
  const key = `${prefix}.${reason}`;
  const translated = t(key);
  return translated === key ? reason : translated;
}
