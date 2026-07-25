import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { debitWallet } from '@/lib/wallet';
import { awardPoints, computePointsEarned } from '@/lib/loyalty';
import { issueInvoiceForTabSettlement } from '@/lib/invoices';

export interface TabSummary {
  id: string;
  label: string | null;
  customerId: string | null;
  customerName: string | null;
  openedAt: string;
  itemCount: number;
  totalCents: number;
}

export interface TabItemRow {
  id: string;
  description: string;
  amountCents: number;
  sessionId: string | null;
  createdAt: string;
}

export interface TabWithItems {
  id: string;
  tenantId: string;
  branchId: string;
  shiftId: string | null;
  customerId: string | null;
  label: string | null;
  status: 'open' | 'settled' | 'void';
  totalCents: number;
  items: TabItemRow[];
}

export async function openTab(input: {
  tenantId: string;
  branchId: string;
  shiftId: string;
  openedBy: string;
  customerId?: string;
  label?: string;
}): Promise<{ tabId: string }> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('tabs')
    .insert({
      tenant_id: input.tenantId,
      branch_id: input.branchId,
      shift_id: input.shiftId,
      customer_id: input.customerId ?? null,
      label: input.label ?? null,
      opened_by: input.openedBy,
    } as never)
    .select('id')
    .single();
  if (error || !data) throw error ?? new Error('Failed to open tab');

  await admin.from('activity_log').insert({
    tenant_id: input.tenantId,
    branch_id: input.branchId,
    actor_id: input.openedBy,
    actor_role: 'staff',
    action: 'tab.opened',
    entity_type: 'tab',
    entity_id: data.id,
    after: { customer_id: input.customerId ?? null, label: input.label ?? null },
  });

  return { tabId: data.id };
}

/**
 * Adds a session's charge as a line item on a tab and bumps the running
 * total. Unlike the sketch signature (tabId, sessionId), the amount and
 * description are passed in explicitly — a tab-mode session never gets a
 * `payments` row at seat time (payment is deferred to settlement), so there
 * is nowhere else to read the charge back from.
 */
export async function addSessionToTab(
  tabId: string,
  sessionId: string,
  amountCents: number,
  description: string
): Promise<void> {
  const admin = createAdminClient();

  const { error: itemError } = await admin.from('tab_items').insert({
    tab_id: tabId,
    session_id: sessionId,
    description,
    amount_cents: amountCents,
  } as never);
  if (itemError) throw itemError;

  const { data: tab, error: tabError } = await admin
    .from('tabs')
    .select('total_cents')
    .eq('id', tabId)
    .maybeSingle();
  if (tabError || !tab) throw tabError ?? new Error('Tab not found');

  const { error: updateError } = await admin
    .from('tabs')
    .update({ total_cents: tab.total_cents + amountCents } as never)
    .eq('id', tabId);
  if (updateError) throw updateError;
}

export async function getTab(tabId: string): Promise<TabWithItems | null> {
  const admin = createAdminClient();
  const { data: tab, error } = await admin
    .from('tabs')
    .select('id, tenant_id, branch_id, shift_id, customer_id, label, status, total_cents')
    .eq('id', tabId)
    .maybeSingle();
  if (error) throw error;
  if (!tab) return null;

  const { data: items } = await admin
    .from('tab_items')
    .select('id, description, amount_cents, session_id, created_at')
    .eq('tab_id', tabId)
    .order('created_at', { ascending: true });

  return {
    id: tab.id,
    tenantId: tab.tenant_id,
    branchId: tab.branch_id,
    shiftId: tab.shift_id,
    customerId: tab.customer_id,
    label: tab.label,
    status: tab.status as 'open' | 'settled' | 'void',
    totalCents: tab.total_cents,
    items: (items ?? []).map((i) => ({
      id: i.id,
      description: i.description,
      amountCents: i.amount_cents,
      sessionId: i.session_id,
      createdAt: i.created_at,
    })),
  };
}

export async function getOpenTabs(tenantId: string, branchId: string): Promise<TabSummary[]> {
  const admin = createAdminClient();
  const { data: tabsRaw, error } = await admin
    .from('tabs')
    .select('id, label, customer_id, opened_at, total_cents')
    .eq('tenant_id', tenantId)
    .eq('branch_id', branchId)
    .eq('status', 'open')
    .order('opened_at', { ascending: true });
  if (error) throw error;
  if (!tabsRaw || tabsRaw.length === 0) return [];

  const tabIds = tabsRaw.map((t) => t.id);
  const customerIds = [...new Set(tabsRaw.map((t) => t.customer_id).filter((id): id is string => !!id))];

  const [{ data: itemsRaw }, { data: profilesRaw }] = await Promise.all([
    admin.from('tab_items').select('tab_id').in('tab_id', tabIds),
    customerIds.length
      ? admin.from('profiles').select('id, full_name').in('id', customerIds)
      : Promise.resolve({ data: [] as Array<{ id: string; full_name: string | null }> }),
  ]);
  const itemCountMap = new Map<string, number>();
  for (const item of itemsRaw ?? []) {
    itemCountMap.set(item.tab_id, (itemCountMap.get(item.tab_id) ?? 0) + 1);
  }
  const profileMap = new Map((profilesRaw ?? []).map((p) => [p.id, p.full_name]));

  return tabsRaw.map((t) => ({
    id: t.id,
    label: t.label,
    customerId: t.customer_id,
    customerName: t.customer_id ? (profileMap.get(t.customer_id) ?? null) : null,
    openedAt: t.opened_at,
    itemCount: itemCountMap.get(t.id) ?? 0,
    totalCents: t.total_cents,
  }));
}

export async function voidTab(tabId: string, reason: string, actorId: string): Promise<void> {
  const admin = createAdminClient();
  const { data: tab, error } = await admin
    .from('tabs')
    .select('id, tenant_id, branch_id, status')
    .eq('id', tabId)
    .maybeSingle();
  if (error || !tab) throw error ?? new Error('Tab not found');
  if (tab.status !== 'open') throw new Error('tab_not_open');

  const { error: updateError } = await admin.from('tabs').update({ status: 'void' } as never).eq('id', tabId);
  if (updateError) throw updateError;

  await admin.from('activity_log').insert({
    tenant_id: tab.tenant_id,
    branch_id: tab.branch_id,
    actor_id: actorId,
    actor_role: 'staff',
    action: 'tab.voided',
    entity_type: 'tab',
    entity_id: tabId,
    after: { reason },
  });
}

export interface SettleTabPaymentLine {
  method: 'cash' | 'card' | 'wallet';
  amountCents: number;
}

export interface SettleTabResult {
  invoiceId?: string;
  totalPaidCents: number;
  changeCents: number;
}

/**
 * Settle a tab against one or more tender lines. Each line becomes its own
 * `payments` row (so shift reconciliation can bucket revenue by method) and
 * a `tab_payments` row linking it back to the tab. Only cash may be
 * over-tendered — the excess becomes change and is never billed to a
 * customer's wallet/card, so wallet/card lines must add up to no more than
 * what's still owed at the point they're applied.
 *
 * Not wrapped in a single DB transaction — this mirrors the rest of the
 * codebase (see startCashierSession: wallet debit, payment insert, and
 * session insert are three sequential awaited calls, not one RPC). Each
 * wallet debit is independently atomic via its own RPC; a mid-settlement
 * failure here leaves the tab open (not double-charged) and is safe to retry.
 */
export async function settleTab(input: {
  tabId: string;
  payments: SettleTabPaymentLine[];
  actorId: string;
}): Promise<SettleTabResult> {
  const admin = createAdminClient();

  const { data: tab, error } = await admin
    .from('tabs')
    .select('id, tenant_id, branch_id, shift_id, customer_id, label, status, total_cents')
    .eq('id', input.tabId)
    .maybeSingle();
  if (error || !tab) throw error ?? new Error('Tab not found');
  if (tab.status !== 'open') throw new Error('tab_not_open');
  if (input.payments.length === 0) throw new Error('no_payment_lines');

  const walletLines = input.payments.filter((p) => p.method === 'wallet');
  if (walletLines.length > 0 && !tab.customer_id) throw new Error('wallet_requires_customer');

  const tenderedTotal = input.payments.reduce((sum, p) => sum + p.amountCents, 0);
  if (tenderedTotal < tab.total_cents) throw new Error('underpayment');

  // Non-cash lines must never be asked to cover more than the bill — only
  // cash can be over-tendered to make change.
  const nonCashTotal = input.payments.filter((p) => p.method !== 'cash').reduce((sum, p) => sum + p.amountCents, 0);
  if (nonCashTotal > tab.total_cents) throw new Error('overpayment_must_be_cash');

  let remainingToApply = tab.total_cents;
  let changeCents = 0;
  const tabPaymentRows: Array<{ method: 'cash' | 'card' | 'wallet'; tenderedCents: number; appliedCents: number; paymentId: string }> = [];

  for (const line of input.payments) {
    const appliedCents = line.method === 'cash' ? Math.min(line.amountCents, remainingToApply) : line.amountCents;
    remainingToApply -= appliedCents;
    if (line.method === 'cash') changeCents += line.amountCents - appliedCents;

    if (line.method === 'wallet') {
      await debitWallet({
        tenantId: tab.tenant_id,
        customerId: tab.customer_id!,
        amountCents: appliedCents,
        kind: 'debit_purchase',
        reason: `Tab settlement — ${tab.label ?? 'walk-in group'}`,
        referenceType: 'tab',
        referenceId: tab.id,
        createdBy: input.actorId,
      });
    }

    const { data: payment, error: paymentError } = await admin
      .from('payments')
      .insert({
        tenant_id: tab.tenant_id,
        branch_id: tab.branch_id,
        customer_id: tab.customer_id,
        purpose: 'session',
        amount_cents: appliedCents,
        currency: 'SAR',
        provider: line.method === 'cash' ? 'cash' : 'manual',
        method: line.method,
        status: 'captured',
        captured_at: new Date().toISOString(),
        initiated_by: input.actorId,
        shift_id: tab.shift_id,
      } as never)
      .select('id')
      .single();
    if (paymentError || !payment) throw paymentError ?? new Error('Failed to record tender');

    tabPaymentRows.push({ method: line.method, tenderedCents: line.amountCents, appliedCents, paymentId: payment.id });
  }

  if (remainingToApply !== 0) throw new Error('underpayment');

  await admin.from('tab_payments').insert(
    tabPaymentRows.map((r) => ({
      tab_id: tab.id,
      method: r.method,
      amount_cents: r.tenderedCents,
      payment_id: r.paymentId,
    })) as never
  );

  const { error: settleError } = await admin
    .from('tabs')
    .update({ status: 'settled', settled_at: new Date().toISOString() } as never)
    .eq('id', tab.id);
  if (settleError) throw settleError;

  let invoiceId: string | undefined;
  try {
    const invoice = await issueInvoiceForTabSettlement({
      tenantId: tab.tenant_id,
      branchId: tab.branch_id,
      tabId: tab.id,
      totalCents: tab.total_cents,
      issuedBy: input.actorId,
    });
    invoiceId = invoice.invoiceId;
  } catch (invoiceError) {
    console.error('[tabs] CRITICAL: failed to issue invoice for tab settlement', tab.id, invoiceError);
  }

  await admin.from('activity_log').insert({
    tenant_id: tab.tenant_id,
    branch_id: tab.branch_id,
    actor_id: input.actorId,
    actor_role: 'staff',
    action: 'tab.settled',
    entity_type: 'tab',
    entity_id: tab.id,
    after: {
      total_cents: tab.total_cents,
      change_cents: changeCents,
      payments: tabPaymentRows.map((r) => ({ method: r.method, tendered_cents: r.tenderedCents, applied_cents: r.appliedCents })),
      invoice_id: invoiceId ?? null,
    },
  });

  if (tab.customer_id) {
    const { data: profile } = await admin.from('profiles').select('walk_in_created').eq('id', tab.customer_id).maybeSingle();
    if (profile && !profile.walk_in_created) {
      await awardPoints({
        tenantId: tab.tenant_id,
        customerId: tab.customer_id,
        points: computePointsEarned(tab.total_cents, false),
        reason: 'tab_settled',
        referenceType: 'tab',
        referenceId: tab.id,
        actorId: input.actorId,
      });
    }
  }

  return { invoiceId, totalPaidCents: tab.total_cents, changeCents };
}
