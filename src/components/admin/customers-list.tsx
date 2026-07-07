'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useT } from '@/i18n/context';
import { formatMoney } from '@/lib/utils';
import type { ListCustomersResult } from '@/lib/customers';
import { listCustomersAction } from '@/app/admin/customers/actions';
import { Search, Loader2, ChevronLeft, ChevronRight } from 'lucide-react';

const TIER_BADGE: Record<string, string> = {
  silver: 'bg-slate-400/15 text-slate-300 border-slate-400/30',
  gold: 'bg-gold-500/15 text-gold-400 border-gold-500/30',
  platinum: 'bg-cyan-400/15 text-cyan-300 border-cyan-400/30',
  diamond: 'bg-violet-400/15 text-violet-300 border-violet-400/30',
  vip: 'bg-violet-400/15 text-violet-300 border-violet-400/30',
};

type SortBy = 'recent' | 'spend' | 'visits' | 'name' | 'tier';

export function CustomersList({ initialData }: { initialData: ListCustomersResult }) {
  const { t } = useT();
  const router = useRouter();

  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [tierFilter, setTierFilter] = useState('');
  const [sortBy, setSortBy] = useState<SortBy>('recent');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<ListCustomersResult>(initialData);
  const [pending, startPending] = useTransition();
  const isFirstRun = useRef(true);

  // Debounce the free-text search box.
  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(searchInput.trim()), 400);
    return () => clearTimeout(id);
  }, [searchInput]);

  // Refetch whenever search/filter/sort/page changes. Reset to page 1 on
  // anything except an explicit page change.
  useEffect(() => {
    if (isFirstRun.current) { isFirstRun.current = false; return; }
    setPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch, tierFilter, sortBy]);

  useEffect(() => {
    startPending(async () => {
      const res = await listCustomersAction({
        search: debouncedSearch || undefined,
        tierFilter: tierFilter || undefined,
        sortBy,
        page,
      });
      if (res.ok) setData(res);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch, tierFilter, sortBy, page]);

  const totalPages = Math.max(1, Math.ceil(data.total / data.pageSize));

  return (
    <div className="space-y-4">
      {/* Search + filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px] max-w-sm">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder={t('adminCustomers.searchPlaceholder')}
            className="ps-9"
          />
        </div>
        <select
          value={tierFilter}
          onChange={(e) => setTierFilter(e.target.value)}
          className="flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <option value="">{t('adminCustomers.allTiers')}</option>
          <option value="silver">{t('loyalty.tier.silver')}</option>
          <option value="gold">{t('loyalty.tier.gold')}</option>
          <option value="platinum">{t('loyalty.tier.platinum')}</option>
          <option value="diamond">{t('loyalty.tier.diamond')}</option>
        </select>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as SortBy)}
          className="flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <option value="recent">{t('adminCustomers.sortRecent')}</option>
          <option value="spend">{t('adminCustomers.sortSpend')}</option>
          <option value="visits">{t('adminCustomers.sortVisits')}</option>
          <option value="name">{t('adminCustomers.sortName')}</option>
          <option value="tier">{t('adminCustomers.sortTier')}</option>
        </select>
        {pending && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
      </div>

      {/* Table */}
      {data.customers.length === 0 ? (
        <p className="text-sm text-muted-foreground py-10 text-center">{t('adminCustomers.noCustomers')}</p>
      ) : (
        <div className="rounded-xl border border-border/60 overflow-hidden overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 text-muted-foreground text-xs uppercase tracking-wide">
              <tr>
                <th className="px-4 py-3 text-start">{t('adminCustomers.customer')}</th>
                <th className="px-4 py-3 text-start">{t('adminCustomers.tier')}</th>
                <th className="px-4 py-3 text-end">{t('adminCustomers.points')}</th>
                <th className="px-4 py-3 text-end">{t('adminCustomers.walletBalance')}</th>
                <th className="px-4 py-3 text-end">{t('adminCustomers.totalSpent')}</th>
                <th className="px-4 py-3 text-end">{t('adminCustomers.visits')}</th>
                <th className="px-4 py-3 text-end">{t('adminCustomers.lastVisit')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {data.customers.map((c) => (
                <tr
                  key={c.customerId}
                  className="hover:bg-muted/10 transition-colors cursor-pointer"
                  onClick={() => router.push(`/admin/customers/${c.customerId}`)}
                >
                  <td className="px-4 py-3">
                    <div className="font-medium flex items-center gap-1.5">
                      {c.fullName ?? '—'}
                      {c.isWalkInCreated && (
                        <span className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-muted/40 text-muted-foreground">
                          {t('adminCustomers.walkIn')}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground font-mono">{c.phone ?? c.email ?? ''}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase ${TIER_BADGE[c.tier] ?? TIER_BADGE.silver}`}>
                      {c.tier}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-end font-mono">{c.pointsBalance.toLocaleString()}</td>
                  <td className="px-4 py-3 text-end font-mono">{formatMoney(c.walletBalanceCents)}</td>
                  <td className="px-4 py-3 text-end font-mono font-semibold text-gold-400">{formatMoney(c.totalSpentCents)}</td>
                  <td className="px-4 py-3 text-end font-mono">{c.visitCount}</td>
                  <td className="px-4 py-3 text-end text-xs text-muted-foreground">
                    {c.lastVisitAt ? new Date(c.lastVisitAt).toLocaleDateString('en-US') : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {data.total > 0 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>{t('adminCustomers.pageIndicator', { page: String(data.page), total: String(totalPages), count: String(data.total) })}</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1 || pending} onClick={() => setPage((p) => Math.max(1, p - 1))}>
              <ChevronLeft className="h-4 w-4" />
              {t('adminCustomers.prevPage')}
            </Button>
            <Button variant="outline" size="sm" disabled={page >= totalPages || pending} onClick={() => setPage((p) => p + 1)}>
              {t('adminCustomers.nextPage')}
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
