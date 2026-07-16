import type { Metadata, Viewport } from 'next';
import { Inter, Tajawal, Cairo, Orbitron } from 'next/font/google';
import { cookies } from 'next/headers';
import './globals.css';
import { LocaleProvider } from '@/i18n/context';
import { ThemeProvider, type Theme } from '@/theme/context';
import { DynamicToaster } from '@/components/dynamic-toaster';
import { cn } from '@/lib/utils';
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

// Cairo — Arabic display+body for the poster design system (dashboard proof
// of concept). Cabinet Grotesk/Satoshi (Latin) are loaded via the Fontshare
// CDN link below, since they aren't on Google Fonts / next/font.
const cairo = Cairo({
  subsets: ['arabic', 'latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-cairo',
  display: 'swap',
});

// Orbitron — display/numerals face for the neon-arcade dashboard redesign
// (logotype + hero numbers only; Tajawal above already covers body/UI text).
const orbitron = Orbitron({
  subsets: ['latin'],
  weight: ['600', '700', '800', '900'],
  variable: '--font-orbitron',
  display: 'swap',
});

export const metadata: Metadata = {
  title: {
    default: 'BOLOS ALLEY OS — Entertainment Venue Operating System',
    template: '%s | BOLOS ALLEY OS',
  },
  description:
    'Modern operating system for billiard, bowling, PS5, karaoke and more. Bookings, queues, loyalty, AI WhatsApp agent, real-time analytics.',
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

  // Poster design system theme (dashboard proof-of-concept). Deliberately a
  // SEPARATE `poster-dark` class rather than reusing the literal `dark`
  // class below — that class is hardcoded on to keep the existing
  // dark+gold theme active everywhere; it isn't driven by any toggle today,
  // so reusing it here would make every other screen default to an
  // unstyled light shadcn theme the moment this cookie is absent.
  const themeCookie = cookieStore.get('poster-theme')?.value;
  const theme: Theme = themeCookie === 'dark' ? 'dark' : 'light';
  const hasStoredPreference = themeCookie === 'light' || themeCookie === 'dark';

  return (
    <html
      lang={locale}
      dir={dir}
      className={cn('dark', theme === 'dark' && 'poster-dark', inter.variable, tajawal.variable, cairo.variable, orbitron.variable)}
      suppressHydrationWarning
    >
      <head>
        <link rel="preconnect" href="https://api.fontshare.com" />
        <link
          rel="stylesheet"
          href="https://api.fontshare.com/v2/css?f[]=cabinet-grotesk@800,700,500&f[]=satoshi@400,500,700,900&display=swap"
        />
      </head>
      <body className="min-h-screen bg-background font-sans antialiased">
        <LocaleProvider initialLocale={locale}>
          <ThemeProvider initialTheme={theme} hasStoredPreference={hasStoredPreference}>
            {children}
            <DynamicToaster />
          </ThemeProvider>
        </LocaleProvider>
      </body>
    </html>
  );
}
