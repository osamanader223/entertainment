import Link from 'next/link';
import { requireAuth } from '@/lib/auth';
import { getWalletBalance, getWalletLedger } from '@/lib/wallet';
import { getServerDict } from '@/i18n/server';
import { TopUpFlow } from '@/components/wallet/top-up-flow';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { formatMoney } from '@/lib/utils';
import { ArrowLeft, ArrowDownLeft, ArrowUpRight, Wallet } from 'lucide-react';

export const metadata = { title: 'Wallet' };
export const dynamic = 'force-dynamic';

const DEMO_TENANT_ID = '11111111-1111-1111-1111-111111111111';

// wallet_ledger table not yet in generated Supabase types (added via migration 00006)
type LedgerEntry = {
  id: string;
  kind: string;
  delta_cents: number;
  balance_after_cents: number;
  reason: string | null;
  reference_type: string | null;
  reference_id: string | null;
  created_at: string;
};

export default async function WalletPage() {
  const ctx = await requireAuth();
  const { d } = await getServerDict();

  const [walletBalanceCents, ledger] = await Promise.all([
    getWalletBalance(DEMO_TENANT_ID, ctx.userId),
    getWalletLedger(DEMO_TENANT_ID, ctx.userId, 20) as unknown as Promise<LedgerEntry[]>,
  ]);

  return (
    <div className="space-y-6 max-w-2xl">
      <Button variant="ghost" size="sm" asChild className="-ml-2">
        <Link href="/dashboard">
          <ArrowLeft className="h-4 w-4" />
          {d.nav.overview}
        </Link>
      </Button>

      <div>
        <h1 className="text-3xl font-bold">{d.wallet.title}</h1>
        <p className="text-muted-foreground mt-1">{d.wallet.subtitle}</p>
      </div>

      <Card className="glass border-gold-500/30">
        <CardContent className="p-6">
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <Wallet className="h-4 w-4 text-gold-400" />
            {d.wallet.currentBalance}
          </div>
          <div className="mt-3 text-4xl font-bold text-gradient-gold font-mono tabular-nums">
            {formatMoney(walletBalanceCents)}
          </div>
        </CardContent>
      </Card>

      <TopUpFlow walletBalanceCents={walletBalanceCents} />

      <div className="space-y-3">
        <h2 className="text-lg font-semibold">{d.wallet.ledgerTitle}</h2>

        {ledger.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">{d.wallet.noTransactions}</p>
        ) : (
          <div className="space-y-2">
            {ledger.map((entry) => {
              const isCredit = entry.delta_cents > 0;
              return (
                <div
                  key={entry.id}
                  className="flex items-center justify-between rounded-lg border border-border/60 bg-card/40 px-4 py-3"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`flex h-8 w-8 items-center justify-center rounded-full ${
                        isCredit ? 'bg-emerald-500/10' : 'bg-rose-500/10'
                      }`}
                    >
                      {isCredit ? (
                        <ArrowDownLeft className="h-4 w-4 text-emerald-400" />
                      ) : (
                        <ArrowUpRight className="h-4 w-4 text-rose-400" />
                      )}
                    </div>
                    <div>
                      <div className="text-sm font-medium">{entry.reason ?? entry.kind}</div>
                      <div className="text-xs text-muted-foreground">
                        {new Date(entry.created_at).toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                  <div
                    className={`font-mono font-semibold tabular-nums ${
                      isCredit ? 'text-emerald-400' : 'text-rose-400'
                    }`}
                  >
                    {isCredit ? '+' : '−'}
                    {formatMoney(Math.abs(entry.delta_cents))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
