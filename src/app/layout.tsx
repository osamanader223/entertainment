import type { Metadata, Viewport } from 'next';
import { Inter, Tajawal } from 'next/font/google';
import { cookies } from 'next/headers';
import './globals.css';
import { LocaleProvider } from '@/i18n/context';
import { DynamicToaster } from '@/components/dynamic-toaster';
import type { Locale } from '@/i18n/dictionaries';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

const tajawal = Tajawal({
  subsets: ['arabic'],
  weight: ['400', '500', '700', '800'],
  variable: '--font-tajawal',
  display: 'swap',
});

export const metadata: Metadata = {
  title: {
    default: 'BOLOS ALLEY OS — Entertainment Venue Operating System',
    template: '%s | BOLOS ALLEY OS',
  },
  description:
    'Modern operating system for billiard, bowling, PS5, VR, karaoke and more. Bookings, queues, loyalty, AI WhatsApp agent, real-time analytics.',
  manifest: '/manifest.json',
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'Bolos OS' },
};

export const viewport: Viewport = {
  themeColor: '#0a0a0a',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const locale = (cookieStore.get('locale')?.value ?? 'ar') as Locale;
  const dir = locale === 'ar' ? 'rtl' : 'ltr';

  return (
    <html lang={locale} dir={dir} className={`dark ${inter.variable} ${tajawal.variable}`} suppressHydrationWarning>
      <body className="min-h-screen bg-background font-sans antialiased">
        <LocaleProvider initialLocale={locale}>
          {children}
          <DynamicToaster />
        </LocaleProvider>
      </body>
    </html>
  );
}
