import { redirect } from 'next/navigation';
import Link from 'next/link';
import { requireAuth } from '@/lib/auth';
import { Card } from '@/components/ui/card';
import { LanguageToggle } from '@/components/language-toggle';
import { OnboardingForm } from '@/components/auth/onboarding-form';

export const metadata = { title: 'Complete your profile' };
export const dynamic = 'force-dynamic';

export default async function OnboardingPage() {
  const ctx = await requireAuth('/onboarding');

  // Already complete — this page is a one-time gate, not a destination.
  if (ctx.profile?.phone) {
    redirect('/dashboard');
  }

  return (
    <div className="neon-theme min-h-screen flex flex-col">
      <header className="px-6 py-5 flex items-center justify-between max-w-6xl mx-auto w-full">
        <Link href="/" className="text-xl font-extrabold text-gradient-gold">
          BOLOS ALLEY OS
        </Link>
        <div className="flex items-center gap-1">
          <LanguageToggle />
        </div>
      </header>
      <main className="flex-1 flex items-center justify-center px-6 pb-12">
        <div className="w-full max-w-md">
          <Card className="glass-strong">
            <OnboardingForm initialFullName={ctx.profile?.full_name ?? ''} />
          </Card>
        </div>
      </main>
    </div>
  );
}
