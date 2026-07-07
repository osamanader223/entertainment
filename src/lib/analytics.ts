import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';

/** 'YYYY-MM-DD' → start-of-day / end-of-day ISO bounds (server-local time, matches admin/page.tsx convention). */
function dateRangeBoundsISO(fromDate: string, toDate: string): { fromISO: string; toISO: string } {
  const from = new Date(`${fromDate}T00:00:00`);
  const to = new Date(`${toDate}T23:59:59.999`);
  return { fromISO: from.toISOString(), toISO: to.toISOString() };
}

function dayKey(iso: string): string {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

interface CapturedPaymentRow {
  amount_cents: number;
  method: string | null;
  customer_id: string | null;
  created_at: string;
}

async function fetchCapturedPayments(tenantId: string, fromISO: string, toISO: string): Promise<CapturedPaymentRow[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('payments')
    .select('amount_cents, method, customer_id, created_at')
    .eq('tenant_id', tenantId)
    .eq('status', 'captured')
    .gte('created_at', fromISO)
    .lte('created_at', toISO);
  if (error) throw error;
  return (data ?? []) as unknown as CapturedPaymentRow[];
}

export async function getRevenueByDay(
  tenantId: string,
  fromDate: string,
  toDate: string,
): Promise<Array<{ date: string; revenueCents: number; transactionCount: number }>> {
  const { fromISO, toISO } = dateRangeBoundsISO(fromDate, toDate);
  const payments = await fetchCapturedPayments(tenantId, fromISO, toISO);

  const byDay = new Map<string, { revenueCents: number; transactionCount: number }>();
  for (const p of payments) {
    const key = dayKey(p.created_at);
    const entry = byDay.get(key) ?? { revenueCents: 0, transactionCount: 0 };
    entry.revenueCents += p.amount_cents;
    entry.transactionCount += 1;
    byDay.set(key, entry);
  }

  // Fill every day in the range (even zero-revenue days) for a contiguous chart timeline.
  const result: Array<{ date: string; revenueCents: number; transactionCount: number }> = [];
  const cursor = new Date(`${fromDate}T00:00:00`);
  const end = new Date(`${toDate}T00:00:00`);
  while (cursor <= end) {
    const key = dayKey(cursor.toISOString());
    const entry = byDay.get(key) ?? { revenueCents: 0, transactionCount: 0 };
    result.push({ date: key, ...entry });
    cursor.setDate(cursor.getDate() + 1);
  }
  return result;
}

export async function getRevenueByMethod(
  tenantId: string,
  fromDate: string,
  toDate: string,
): Promise<Array<{ method: string; revenueCents: number; count: number }>> {
  const { fromISO, toISO } = dateRangeBoundsISO(fromDate, toDate);
  const payments = await fetchCapturedPayments(tenantId, fromISO, toISO);

  const byMethod = new Map<string, { revenueCents: number; count: number }>();
  for (const p of payments) {
    const key = p.method ?? 'other';
    const entry = byMethod.get(key) ?? { revenueCents: 0, count: 0 };
    entry.revenueCents += p.amount_cents;
    entry.count += 1;
    byMethod.set(key, entry);
  }

  return Array.from(byMethod.entries())
    .map(([method, v]) => ({ method, ...v }))
    .sort((a, b) => b.revenueCents - a.revenueCents);
}

/**
 * Revenue by game type — sourced from bookings.wallet_paid_cents and
 * queue_tickets.paid_amount_cents (both carry game_type_id directly).
 * NOTE: cashier walk-in sessions are not attributed here because `sessions`
 * doesn't store game_type_id and payments aren't linked back to sessions for
 * that flow in the current schema — so this is a subset of total revenue,
 * not the grand total (see getKpiSummary for that).
 */
export async function getRevenueByGameType(
  tenantId: string,
  fromDate: string,
  toDate: string,
): Promise<Array<{ gameTypeName: string; gameTypeNameAr: string; revenueCents: number; sessionCount: number }>> {
  const { fromISO, toISO } = dateRangeBoundsISO(fromDate, toDate);
  const admin = createAdminClient();

  const [{ data: bookingsRaw, error: bookingsErr }, { data: ticketsRaw, error: ticketsErr }] = await Promise.all([
    admin
      .from('bookings')
      .select('game_type_id, wallet_paid_cents')
      .eq('tenant_id', tenantId)
      .gte('created_at', fromISO)
      .lte('created_at', toISO),
    admin
      .from('queue_tickets')
      .select('game_type_id, paid_amount_cents')
      .eq('tenant_id', tenantId)
      .gte('created_at', fromISO)
      .lte('created_at', toISO),
  ]);
  if (bookingsErr) throw bookingsErr;
  if (ticketsErr) throw ticketsErr;

  const byGameType = new Map<string, { revenueCents: number; sessionCount: number }>();
  for (const row of (bookingsRaw ?? []) as unknown as Array<{ game_type_id: string; wallet_paid_cents: number }>) {
    const entry = byGameType.get(row.game_type_id) ?? { revenueCents: 0, sessionCount: 0 };
    entry.revenueCents += row.wallet_paid_cents;
    entry.sessionCount += 1;
    byGameType.set(row.game_type_id, entry);
  }
  for (const row of (ticketsRaw ?? []) as unknown as Array<{ game_type_id: string; paid_amount_cents: number }>) {
    const entry = byGameType.get(row.game_type_id) ?? { revenueCents: 0, sessionCount: 0 };
    entry.revenueCents += row.paid_amount_cents;
    entry.sessionCount += 1;
    byGameType.set(row.game_type_id, entry);
  }

  if (byGameType.size === 0) return [];

  const { data: gameTypesRaw } = await admin
    .from('game_types')
    .select('id, display_name_en, display_name_ar')
    .in('id', Array.from(byGameType.keys()));
  const gameTypeMap = new Map(
    ((gameTypesRaw ?? []) as unknown as Array<{ id: string; display_name_en: string; display_name_ar: string }>)
      .map((g) => [g.id, g]),
  );

  return Array.from(byGameType.entries())
    .map(([gameTypeId, v]) => ({
      gameTypeName: gameTypeMap.get(gameTypeId)?.display_name_en ?? gameTypeId,
      gameTypeNameAr: gameTypeMap.get(gameTypeId)?.display_name_ar ?? gameTypeId,
      ...v,
    }))
    .sort((a, b) => b.revenueCents - a.revenueCents);
}

export async function getPeakHours(
  tenantId: string,
  fromDate: string,
  toDate: string,
): Promise<Array<{ hour: number; sessionCount: number }>> {
  const { fromISO, toISO } = dateRangeBoundsISO(fromDate, toDate);
  const admin = createAdminClient();

  const { data, error } = await admin
    .from('sessions')
    .select('started_at')
    .eq('tenant_id', tenantId)
    .gte('started_at', fromISO)
    .lte('started_at', toISO);
  if (error) throw error;

  const counts = new Array(24).fill(0) as number[];
  for (const row of (data ?? []) as unknown as Array<{ started_at: string }>) {
    const hour = new Date(row.started_at).getHours();
    counts[hour] += 1;
  }

  return counts.map((sessionCount, hour) => ({ hour, sessionCount }));
}

export async function getTopCustomers(
  tenantId: string,
  fromDate: string,
  toDate: string,
  limit = 10,
): Promise<Array<{ customerId: string; fullName: string | null; phone: string | null; totalSpentCents: number; visitCount: number; tier: string }>> {
  const { fromISO, toISO } = dateRangeBoundsISO(fromDate, toDate);
  const payments = await fetchCapturedPayments(tenantId, fromISO, toISO);

  const byCustomer = new Map<string, { totalSpentCents: number; visitCount: number }>();
  for (const p of payments) {
    if (!p.customer_id) continue;
    const entry = byCustomer.get(p.customer_id) ?? { totalSpentCents: 0, visitCount: 0 };
    entry.totalSpentCents += p.amount_cents;
    entry.visitCount += 1;
    byCustomer.set(p.customer_id, entry);
  }

  const top = Array.from(byCustomer.entries())
    .sort((a, b) => b[1].totalSpentCents - a[1].totalSpentCents)
    .slice(0, limit);
  if (top.length === 0) return [];

  const admin = createAdminClient();
  const customerIds = top.map(([id]) => id);
  const [{ data: profilesRaw }, { data: loyaltyRaw }] = await Promise.all([
    admin.from('profiles').select('id, full_name, phone').in('id', customerIds),
    admin.from('loyalty_accounts').select('customer_id, tier').eq('tenant_id', tenantId).in('customer_id', customerIds),
  ]);
  const profileMap = new Map(
    ((profilesRaw ?? []) as unknown as Array<{ id: string; full_name: string | null; phone: string | null }>)
      .map((p) => [p.id, p]),
  );
  const tierMap = new Map(
    ((loyaltyRaw ?? []) as unknown as Array<{ customer_id: string; tier: string }>)
      .map((l) => [l.customer_id, l.tier]),
  );

  return top.map(([customerId, v]) => ({
    customerId,
    fullName: profileMap.get(customerId)?.full_name ?? null,
    phone: profileMap.get(customerId)?.phone ?? null,
    totalSpentCents: v.totalSpentCents,
    visitCount: v.visitCount,
    tier: tierMap.get(customerId) ?? 'silver',
  }));
}

export async function getKpiSummary(
  tenantId: string,
  fromDate: string,
  toDate: string,
): Promise<{
  totalRevenueCents: number;
  totalSessions: number;
  uniqueCustomers: number;
  avgSessionValueCents: number;
  newCustomers: number;
}> {
  const { fromISO, toISO } = dateRangeBoundsISO(fromDate, toDate);
  const admin = createAdminClient();

  const [payments, { count: totalSessions }] = await Promise.all([
    fetchCapturedPayments(tenantId, fromISO, toISO),
    admin
      .from('sessions')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .gte('started_at', fromISO)
      .lte('started_at', toISO),
  ]);

  const totalRevenueCents = payments.reduce((sum, p) => sum + p.amount_cents, 0);
  const activeCustomerIds = new Set(payments.map((p) => p.customer_id).filter((id): id is string => !!id));
  const uniqueCustomers = activeCustomerIds.size;
  const avgSessionValueCents = totalSessions && totalSessions > 0 ? Math.round(totalRevenueCents / totalSessions) : 0;

  // "New" = their first-ever captured payment with this tenant falls inside the range
  // (i.e. no captured payment exists before the range start).
  let newCustomers = 0;
  if (activeCustomerIds.size > 0) {
    const { data: priorRaw } = await admin
      .from('payments')
      .select('customer_id')
      .eq('tenant_id', tenantId)
      .eq('status', 'captured')
      .lt('created_at', fromISO)
      .in('customer_id', Array.from(activeCustomerIds));
    const returningIds = new Set(
      ((priorRaw ?? []) as unknown as Array<{ customer_id: string | null }>)
        .map((r) => r.customer_id)
        .filter((id): id is string => !!id),
    );
    newCustomers = activeCustomerIds.size - returningIds.size;
  }

  return {
    totalRevenueCents,
    totalSessions: totalSessions ?? 0,
    uniqueCustomers,
    avgSessionValueCents,
    newCustomers,
  };
}
