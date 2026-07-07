import { requireAuth, userHasAnyRole } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { getServerDict } from '@/i18n/server';
import { WalletManager } from '@/components/admin/wallet-manager';

export const metadata = { title: 'Admin — Wallet' };
export const dynamic = 'force-dynamic';

const ADMIN_ROLES = ['manager', 'tenant_admin'] as const;

export default async function AdminWalletPage() {
  const ctx = await requireAuth('/login');
  if (!userHasAnyRole(ctx, [...ADMIN_ROLES]) && !ctx.isSuperAdmin) redirect('/dashboard');

  const { d } = await getServerDict();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">{d.adminWallet.title}</h1>
        <p className="text-muted-foreground mt-1">{d.adminWallet.subtitle}</p>
      </div>
      <WalletManager />
    </div>
  );
}
