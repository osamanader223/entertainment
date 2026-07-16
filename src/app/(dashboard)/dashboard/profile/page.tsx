import { requireAuth } from '@/lib/auth';
import { getServerDict } from '@/i18n/server';
import { getLoyaltySummary, getCustomerTotalSpentCents } from '@/lib/loyalty';
import { ProfileForm } from '@/components/profile/profile-form';

const DEMO_TENANT_ID = '11111111-1111-1111-1111-111111111111';

export const metadata = { title: 'Profile' };
export const dynamic = 'force-dynamic';

export default async function ProfilePage() {
  const ctx = await requireAuth('/dashboard/profile');
  const { d } = await getServerDict();

  const [loyalty, totalSpentCents] = await Promise.all([
    getLoyaltySummary(DEMO_TENANT_ID, ctx.userId),
    getCustomerTotalSpentCents(DEMO_TENANT_ID, ctx.userId),
  ]);

  const memberSince = ctx.profile?.created_at
    ? new Date(ctx.profile.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    : null;

  return (
    <ProfileForm
      fullName={ctx.profile?.full_name ?? ''}
      phone={ctx.profile?.phone ?? ''}
      email={ctx.email ?? ''}
      preferredLocale={ctx.profile?.preferred_locale === 'en' ? 'en' : 'ar'}
      memberSince={memberSince}
      tier={loyalty.tier}
      tierName={d.loyalty.tier[loyalty.tier]}
      pointsBalance={loyalty.pointsBalance}
      totalSpentCents={totalSpentCents}
    />
  );
}
