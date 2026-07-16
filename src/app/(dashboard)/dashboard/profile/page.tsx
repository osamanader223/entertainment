import { requireAuth } from '@/lib/auth';
import { getServerDict } from '@/i18n/server';

export const metadata = { title: 'Profile' };
export const dynamic = 'force-dynamic';

export default async function ProfilePage() {
  const ctx = await requireAuth('/dashboard/profile');
  const { d } = await getServerDict();

  const memberSince = ctx.profile?.created_at
    ? new Date(ctx.profile.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    : d.profile.notSet;

  const rows: Array<[string, string]> = [
    [d.profile.fullName, ctx.profile?.full_name || d.profile.notSet],
    [d.profile.phone, ctx.phone || d.profile.notSet],
    [d.profile.email, ctx.email || d.profile.notSet],
    [d.profile.memberSince, memberSince],
  ];

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-extrabold text-[color:var(--neon-text-hi)]">{d.profile.title}</h1>
        <p className="text-sm text-[color:var(--neon-text-mid)] mt-1">{d.profile.subtitle}</p>
      </div>

      <div className="rounded-[20px] border border-[#241B39] divide-y divide-[#241B39]" style={{ background: 'var(--neon-surface-card-2)' }}>
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-center justify-between gap-4 px-5 py-4">
            <span className="text-sm text-[color:var(--neon-text-mid)]">{label}</span>
            <span className="text-sm font-bold text-[color:var(--neon-text-hi)] truncate">{value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
