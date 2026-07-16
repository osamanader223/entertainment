import Link from 'next/link';
import { LanguageToggle } from '@/components/language-toggle';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="px-6 py-5 flex items-center justify-between max-w-6xl mx-auto w-full">
        <Link href="/" className="text-xl font-extrabold text-gradient-gold">
          BOLOS ALLEY OS
        </Link>
        <div className="flex items-center gap-1">
          <LanguageToggle />
        </div>
      </header>
      <main className="flex-1 flex items-center justify-center px-6 pb-12">
        <div className="w-full max-w-md">{children}</div>
      </main>
    </div>
  );
}
