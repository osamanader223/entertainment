import { cookies } from 'next/headers';
import { dictionaries, type Locale } from './dictionaries';

export async function getServerLocale(): Promise<Locale> {
  const store = await cookies();
  return (store.get('locale')?.value ?? 'ar') as Locale;
}

export async function getServerDict() {
  const locale = await getServerLocale();
  return {
    locale,
    d: dictionaries[locale],
    dir: locale === 'ar' ? ('rtl' as const) : ('ltr' as const),
  };
}
