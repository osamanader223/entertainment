import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { getCustomerWalletDetail } from '@/lib/wallet-admin';
import { tierForLifetimePoints, TIER_THRESHOLDS, type LoyaltyTier } from '@/lib/loyalty';

const TIER_ORDER: string[] = ['silver', 'gold', 'platinum', 'diamond'];

export interface CustomerListRow {
  customerId: string;
  fullName: string | null;
  phone: string | null;
  email: string | null;
  tier: string;
  pointsBalance: number;
  walletBalanceCents: number;
  totalSpentCents: number;
  visitCount: number;
  lastVisitAt: string | null;
  isWalkInCreated: boolean;
  createdAt: string;
}

export interface ListCustomersResult {
  customers: CustomerListRow[];
  total: number;
  page: number;
  pageSize: number;
}

/**
 * Paginated, searchable list of all customers in the tenant with summary stats.
 *
 * Profiles aren't tenant-scoped in this schema, and real customer signups
 * never get a `user_tenant_roles` row here (only staff do — see staff.ts) —
 * so "customers of this tenant" is derived from the union of customer_id
 * across every place a customer relationship is actually recorded: wallets,
 * loyalty_accounts, bookings, queue_tickets, payments, and sessions.
 */
export async function listCustomers(input: {
  tenantId: string;
  search?: string;
  sortBy?: 'recent' | 'spend' | 'visits' | 'name' | 'tier';
  tierFilter?: string;
  page?: number;
  pageSize?: number;
}): Promise<ListCustomersResult> {
  const admin = createAdminClient();
  const page = Math.max(1, input.page ?? 1);
  const pageSize = Math.max(1, Math.min(100, input.pageSize ?? 25));

  const [
    { data: walletsRaw },
    { data: loyaltyIdsRaw },
    { data: bookingsIdsRaw },
    { data: ticketsIdsRaw },
    { data: paymentsIdsRaw },
    { data: sessionsIdsRaw },
  ] = await Promise.all([
    admin.from('wallets').select('customer_id').eq('tenant_id', input.tenantId),
    admin.from('loyalty_accounts').select('customer_id').eq('tenant_id', input.tenantId),
    admin.from('bookings').select('customer_id').eq('tenant_id', input.tenantId),
    admin.from('queue_tickets').select('customer_id').eq('tenant_id', input.tenantId),
    admin.from('payments').select('customer_id').eq('tenant_id', input.tenantId),
    admin.from('sessions').select('customer_id').eq('tenant_id', input.tenantId),
  ]);

  const idSet = new Set<string>();
  for (const rows of [walletsRaw, loyaltyIdsRaw, bookingsIdsRaw, ticketsIdsRaw, paymentsIdsRaw, sessionsIdsRaw]) {
    for (const r of (rows ?? []) as unknown as Array<{ customer_id: string | null }>) {
      if (r.customer_id) idSet.add(r.customer_id);
    }
  }
  if (idSet.size === 0) return { customers: [], total: 0, page, pageSize };

  const candidateIds = Array.from(idSet);

  let profileQuery = admin
    .from('profiles')
    .select('id, full_name, phone, email, walk_in_created, created_at')
    .in('id', candidateIds);

  const q = input.search?.trim().replace(/[,()]/g, '');
  if (q) {
    profileQuery = profileQuery.or(`full_name.ilike.%${q}%,phone.ilike.%${q}%,email.ilike.%${q}%`);
  }

  const { data: profilesRaw, error: profilesErr } = await profileQuery;
  if (profilesErr) throw profilesErr;
  const profiles = (profilesRaw ?? []) as unknown as Array<{
    id: string; full_name: string | null; phone: string | null; email: string | null;
    walk_in_created: boolean; created_at: string;
  }>;
  if (profiles.length === 0) return { customers: [], total: 0, page, pageSize };

  const filteredIds = profiles.map((p) => p.id);

  const [
    { data: loyaltyRaw },
    { data: walletBalancesRaw },
    { data: paymentAmountsRaw },
    { data: sessionVisitsRaw },
  ] = await Promise.all([
    admin.from('loyalty_accounts').select('customer_id, tier, points_balance').eq('tenant_id', input.tenantId).in('customer_id', filteredIds),
    admin.from('wallets').select('customer_id, balance_cents').eq('tenant_id', input.tenantId).in('customer_id', filteredIds),
    admin.from('payments').select('customer_id, amount_cents').eq('tenant_id', input.tenantId).eq('status', 'captured').in('customer_id', filteredIds),
    admin.from('sessions').select('customer_id, started_at').eq('tenant_id', input.tenantId).in('customer_id', filteredIds),
  ]);

  const tierMap = new Map(
    ((loyaltyRaw ?? []) as unknown as Array<{ customer_id: string; tier: string; points_balance: number }>)
      .map((l) => [l.customer_id, l]),
  );
  const balanceMap = new Map(
    ((walletBalancesRaw ?? []) as unknown as Array<{ customer_id: string; balance_cents: number }>)
      .map((w) => [w.customer_id, w.balance_cents]),
  );

  const spendMap = new Map<string, number>();
  for (const p of (paymentAmountsRaw ?? []) as unknown as Array<{ customer_id: string | null; amount_cents: number }>) {
    if (!p.customer_id) continue;
    spendMap.set(p.customer_id, (spendMap.get(p.customer_id) ?? 0) + p.amount_cents);
  }

  const visitMap = new Map<string, number>();
  const lastVisitMap = new Map<string, string>();
  for (const s of (sessionVisitsRaw ?? []) as unknown as Array<{ customer_id: string | null; started_at: string }>) {
    if (!s.customer_id) continue;
    visitMap.set(s.customer_id, (visitMap.get(s.customer_id) ?? 0) + 1);
    const prev = lastVisitMap.get(s.customer_id);
    if (!prev || new Date(s.started_at) > new Date(prev)) lastVisitMap.set(s.customer_id, s.started_at);
  }

  let rows: CustomerListRow[] = profiles.map((p) => ({
    customerId: p.id,
    fullName: p.full_name,
    phone: p.phone,
    email: p.email,
    tier: tierMap.get(p.id)?.tier ?? 'silver',
    pointsBalance: tierMap.get(p.id)?.points_balance ?? 0,
    walletBalanceCents: balanceMap.get(p.id) ?? 0,
    totalSpentCents: spendMap.get(p.id) ?? 0,
    visitCount: visitMap.get(p.id) ?? 0,
    lastVisitAt: lastVisitMap.get(p.id) ?? null,
    isWalkInCreated: p.walk_in_created,
    createdAt: p.created_at,
  }));

  if (input.tierFilter) {
    rows = rows.filter((r) => r.tier === input.tierFilter);
  }

  const sortBy = input.sortBy ?? 'recent';
  rows.sort((a, b) => {
    switch (sortBy) {
      case 'spend':
        return b.totalSpentCents - a.totalSpentCents;
      case 'visits':
        return b.visitCount - a.visitCount;
      case 'name':
        return (a.fullName ?? '').localeCompare(b.fullName ?? '');
      case 'tier':
        return TIER_ORDER.indexOf(b.tier) - TIER_ORDER.indexOf(a.tier);
      case 'recent':
      default: {
        const at = (r: CustomerListRow) => new Date(r.lastVisitAt ?? r.createdAt).getTime();
        return at(b) - at(a);
      }
    }
  });

  const total = rows.length;
  const start = (page - 1) * pageSize;
  const paged = rows.slice(start, start + pageSize);

  return { customers: paged, total, page, pageSize };
}

export interface CustomerDetail {
  profile: {
    customerId: string;
    fullName: string | null;
    phone: string | null;
    email: string | null;
    createdAt: string;
    lastSeenAt: string | null;
    isWalkInCreated: boolean;
    claimedAt: string | null;
    marketingWhatsappConsent: boolean;
  };
  loyalty: {
    tier: LoyaltyTier;
    pointsBalance: number;
    lifetimePointsEarned: number;
    currentStreakDays: number;
    nextTier: LoyaltyTier | null;
    pointsToNextTier: number | null;
    progressPercent: number;
  };
  wallet: {
    balanceCents: number;
    lifetimeCreditedCents: number;
    lifetimeDebitedCents: number;
    isFrozen: boolean;
  };
  stats: {
    totalSpentCents: number;
    totalSessions: number;
    totalBookings: number;
    avgSessionValueCents: number;
    favoriteGameType: string | null;
    firstVisitAt: string | null;
    lastVisitAt: string | null;
  };
  recentBookings: Array<{ id: string; referenceCode: string; gameTypeName: string; status: string; scheduledStartAt: string }>;
  recentSessions: Array<{
    id: string; stationCode: string; gameTypeName: string; startedAt: string;
    endedAt: string | null; durationSeconds: number | null; amountCents: number | null; status: string;
  }>;
  recentPayments: Array<{ amountCents: number; purpose: string; method: string | null; status: string; createdAt: string }>;
  queueHistory: Array<{ ticketNumber: number; gameTypeName: string; status: string; createdAt: string }>;
  offersUsed: Array<{ offerName: string; discountCents: number; redeemedAt: string }>;
  walletLedger: Array<{ kind: string; deltaCents: number; balanceAfterCents: number; reason: string | null; createdAt: string }>;
}

const TIER_ORDER_TYPED: LoyaltyTier[] = ['silver', 'gold', 'platinum', 'diamond'];

/** Full detail for one customer — everything a staff member would need to see about them. */
export async function getCustomerDetail(tenantId: string, customerId: string): Promise<CustomerDetail> {
  const admin = createAdminClient();

  const { data: profileRaw, error: profileErr } = await admin
    .from('profiles')
    .select('id, full_name, phone, email, created_at, last_seen_at, walk_in_created, claimed_at, marketing_whatsapp_consent')
    .eq('id', customerId)
    .maybeSingle();
  if (profileErr) throw profileErr;
  if (!profileRaw) throw new Error('customer_not_found');
  const profileRow = profileRaw as unknown as {
    id: string; full_name: string | null; phone: string | null; email: string | null;
    created_at: string; last_seen_at: string | null; walk_in_created: boolean;
    claimed_at: string | null; marketing_whatsapp_consent: boolean;
  };

  const [
    { data: loyaltyRaw },
    walletDetail,
    { data: allCapturedPaymentsRaw },
    { count: totalBookingsCount },
    { data: sessionsRaw },
    { data: bookingsRaw },
    { data: ticketsRaw },
    { data: offerRedemptionsRaw },
  ] = await Promise.all([
    admin
      .from('loyalty_accounts')
      .select('tier, points_balance, lifetime_points_earned, current_streak_days')
      .eq('tenant_id', tenantId)
      .eq('customer_id', customerId)
      .maybeSingle(),
    getCustomerWalletDetail(tenantId, customerId),
    admin
      .from('payments')
      .select('amount_cents')
      .eq('tenant_id', tenantId)
      .eq('customer_id', customerId)
      .eq('status', 'captured'),
    admin
      .from('bookings')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('customer_id', customerId),
    admin
      .from('sessions')
      .select('id, station_id, started_at, ended_at, actual_duration_seconds, final_amount_cents, status')
      .eq('tenant_id', tenantId)
      .eq('customer_id', customerId)
      .order('started_at', { ascending: false }),
    admin
      .from('bookings')
      .select('id, reference_code, game_type_id, status, scheduled_start_at')
      .eq('tenant_id', tenantId)
      .eq('customer_id', customerId)
      .order('scheduled_start_at', { ascending: false })
      .limit(10),
    admin
      .from('queue_tickets')
      .select('ticket_number, game_type_id, status, created_at')
      .eq('tenant_id', tenantId)
      .eq('customer_id', customerId)
      .order('created_at', { ascending: false })
      .limit(10),
    admin
      .from('offer_redemptions' as never)
      .select('offer_id, discount_applied_cents, redeemed_at')
      .eq('tenant_id', tenantId)
      .eq('customer_id', customerId)
      .order('redeemed_at', { ascending: false })
      .limit(10),
  ]);

  const loyaltyAccount = loyaltyRaw as unknown as {
    tier: LoyaltyTier; points_balance: number; lifetime_points_earned: number; current_streak_days: number;
  } | null;
  const lifetimePointsEarned = loyaltyAccount?.lifetime_points_earned ?? 0;
  const tier = tierForLifetimePoints(lifetimePointsEarned);
  const tierIdx = TIER_ORDER_TYPED.indexOf(tier);
  const nextTier = tierIdx < TIER_ORDER_TYPED.length - 1 ? TIER_ORDER_TYPED[tierIdx + 1] : null;
  const pointsToNextTier = nextTier ? Math.max(0, TIER_THRESHOLDS[nextTier] - lifetimePointsEarned) : null;
  const progressPercent = nextTier
    ? Math.min(100, Math.max(0, ((lifetimePointsEarned - TIER_THRESHOLDS[tier]) / (TIER_THRESHOLDS[nextTier] - TIER_THRESHOLDS[tier])) * 100))
    : 100;

  const totalSpentCents = ((allCapturedPaymentsRaw ?? []) as unknown as Array<{ amount_cents: number }>)
    .reduce((sum, p) => sum + p.amount_cents, 0);

  const sessions = (sessionsRaw ?? []) as unknown as Array<{
    id: string; station_id: string; started_at: string; ended_at: string | null;
    actual_duration_seconds: number | null; final_amount_cents: number | null; status: string;
  }>;
  const totalSessions = sessions.length;
  const avgSessionValueCents = totalSessions > 0 ? Math.round(totalSpentCents / totalSessions) : 0;
  const firstVisitAt = sessions.length > 0 ? sessions[sessions.length - 1].started_at : null;
  const lastVisitAt = sessions.length > 0 ? sessions[0].started_at : null;

  const bookings = (bookingsRaw ?? []) as unknown as Array<{
    id: string; reference_code: string; game_type_id: string; status: string; scheduled_start_at: string;
  }>;
  const tickets = (ticketsRaw ?? []) as unknown as Array<{
    ticket_number: number; game_type_id: string; status: string; created_at: string;
  }>;
  const offerRedemptions = (offerRedemptionsRaw ?? []) as unknown as Array<{
    offer_id: string; discount_applied_cents: number; redeemed_at: string;
  }>;

  // Resolve station -> game type for sessions, and game type names for bookings/queue.
  const stationIds = [...new Set(sessions.map((s) => s.station_id))];
  const [{ data: stationsRaw }, { data: gameTypesRaw }, { data: offersRaw }] = await Promise.all([
    stationIds.length
      ? admin.from('stations').select('id, code, game_type_id').in('id', stationIds)
      : Promise.resolve({ data: [] }),
    admin.from('game_types').select('id, display_name_en').eq('tenant_id', tenantId),
    offerRedemptions.length
      ? admin.from('offers').select('id, name').in('id', [...new Set(offerRedemptions.map((o) => o.offer_id))])
      : Promise.resolve({ data: [] }),
  ]);
  const stationMap = new Map(
    ((stationsRaw ?? []) as unknown as Array<{ id: string; code: string; game_type_id: string }>)
      .map((s) => [s.id, s]),
  );
  const gameTypeMap = new Map(
    ((gameTypesRaw ?? []) as unknown as Array<{ id: string; display_name_en: string }>)
      .map((g) => [g.id, g.display_name_en]),
  );
  const offerNameMap = new Map(
    ((offersRaw ?? []) as unknown as Array<{ id: string; name: string }>)
      .map((o) => [o.id, o.name]),
  );

  // Favorite game type: most sessions by game type (via station -> game_type_id).
  const gameTypeSessionCounts = new Map<string, number>();
  for (const s of sessions) {
    const gtId = stationMap.get(s.station_id)?.game_type_id;
    if (!gtId) continue;
    gameTypeSessionCounts.set(gtId, (gameTypeSessionCounts.get(gtId) ?? 0) + 1);
  }
  let favoriteGameType: string | null = null;
  let favoriteCount = 0;
  for (const [gtId, count] of gameTypeSessionCounts) {
    if (count > favoriteCount) {
      favoriteCount = count;
      favoriteGameType = gameTypeMap.get(gtId) ?? null;
    }
  }

  const recentSessions = sessions.slice(0, 10).map((s) => ({
    id: s.id,
    stationCode: stationMap.get(s.station_id)?.code ?? '—',
    gameTypeName: gameTypeMap.get(stationMap.get(s.station_id)?.game_type_id ?? '') ?? '—',
    startedAt: s.started_at,
    endedAt: s.ended_at,
    durationSeconds: s.actual_duration_seconds,
    amountCents: s.final_amount_cents,
    status: s.status,
  }));

  const recentBookings = bookings.map((b) => ({
    id: b.id,
    referenceCode: b.reference_code,
    gameTypeName: gameTypeMap.get(b.game_type_id) ?? '—',
    status: b.status,
    scheduledStartAt: b.scheduled_start_at,
  }));

  const queueHistory = tickets.map((t) => ({
    ticketNumber: t.ticket_number,
    gameTypeName: gameTypeMap.get(t.game_type_id) ?? '—',
    status: t.status,
    createdAt: t.created_at,
  }));

  const offersUsed = offerRedemptions.map((o) => ({
    offerName: offerNameMap.get(o.offer_id) ?? '—',
    discountCents: o.discount_applied_cents,
    redeemedAt: o.redeemed_at,
  }));

  return {
    profile: {
      customerId: profileRow.id,
      fullName: profileRow.full_name,
      phone: profileRow.phone,
      email: profileRow.email,
      createdAt: profileRow.created_at,
      lastSeenAt: profileRow.last_seen_at,
      isWalkInCreated: profileRow.walk_in_created,
      claimedAt: profileRow.claimed_at,
      marketingWhatsappConsent: profileRow.marketing_whatsapp_consent,
    },
    loyalty: {
      tier,
      pointsBalance: loyaltyAccount?.points_balance ?? 0,
      lifetimePointsEarned,
      currentStreakDays: loyaltyAccount?.current_streak_days ?? 0,
      nextTier,
      pointsToNextTier,
      progressPercent,
    },
    wallet: {
      balanceCents: walletDetail.balanceCents,
      lifetimeCreditedCents: walletDetail.lifetimeCreditedCents,
      lifetimeDebitedCents: walletDetail.lifetimeDebitedCents,
      isFrozen: walletDetail.isFrozen,
    },
    stats: {
      totalSpentCents,
      totalSessions,
      totalBookings: totalBookingsCount ?? 0,
      avgSessionValueCents,
      favoriteGameType,
      firstVisitAt,
      lastVisitAt,
    },
    recentBookings,
    recentSessions,
    recentPayments: walletDetail.recentPayments.slice(0, 10).map((p) => ({
      amountCents: p.amountCents,
      purpose: p.purpose,
      method: p.method,
      status: p.status,
      createdAt: p.createdAt,
    })),
    queueHistory,
    offersUsed,
    walletLedger: walletDetail.ledger.slice(0, 15),
  };
}

/**
 * Update a customer's editable profile fields (staff can fix a name, toggle
 * marketing consent). Deliberately excludes phone/email — those are the
 * customer's login identity and shouldn't be changed by staff from here.
 */
export async function updateCustomerProfile(input: {
  tenantId: string;
  customerId: string;
  fullName?: string;
  marketingWhatsappConsent?: boolean;
  actorId: string;
}): Promise<void> {
  const admin = createAdminClient();
  const update: Record<string, unknown> = {};
  const changedFields: string[] = [];
  if (input.fullName !== undefined) { update.full_name = input.fullName; changedFields.push('fullName'); }
  if (input.marketingWhatsappConsent !== undefined) {
    update.marketing_whatsapp_consent = input.marketingWhatsappConsent;
    changedFields.push('marketingWhatsappConsent');
  }
  if (changedFields.length === 0) return;

  const { error } = await admin.from('profiles').update(update as never).eq('id', input.customerId);
  if (error) throw error;

  await admin.from('activity_log').insert({
    tenant_id: input.tenantId,
    actor_id: input.actorId,
    actor_role: 'manager' as never,
    action: 'customer.profile_updated',
    entity_type: 'profile',
    entity_id: input.customerId,
    after: { target_customer: input.customerId, changed_fields: changedFields } as never,
  });
}

export interface CustomerNote {
  id: string;
  note: string;
  authorName: string | null;
  createdAt: string;
}

/** Add a private staff note about a customer — the CRM touch (e.g. "prefers lane 3"). */
export async function addCustomerNote(input: {
  tenantId: string; customerId: string; note: string; actorId: string;
}): Promise<{ noteId: string }> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('customer_notes' as never)
    .insert({
      tenant_id: input.tenantId,
      customer_id: input.customerId,
      author_id: input.actorId,
      note: input.note,
    } as never)
    .select('id')
    .single();
  if (error) throw error;
  return { noteId: (data as unknown as { id: string }).id };
}

export async function listCustomerNotes(tenantId: string, customerId: string): Promise<CustomerNote[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('customer_notes' as never)
    .select('id, note, author_id, created_at')
    .eq('tenant_id', tenantId)
    .eq('customer_id', customerId)
    .order('created_at', { ascending: false });
  if (error) throw error;

  const rows = (data ?? []) as unknown as Array<{ id: string; note: string; author_id: string | null; created_at: string }>;
  if (rows.length === 0) return [];

  const authorIds = [...new Set(rows.map((r) => r.author_id).filter((id): id is string => !!id))];
  const { data: authorsRaw } = authorIds.length
    ? await admin.from('profiles').select('id, full_name').in('id', authorIds)
    : { data: [] };
  const authorMap = new Map(
    ((authorsRaw ?? []) as unknown as Array<{ id: string; full_name: string | null }>)
      .map((a) => [a.id, a.full_name]),
  );

  return rows.map((r) => ({
    id: r.id,
    note: r.note,
    authorName: r.author_id ? (authorMap.get(r.author_id) ?? null) : null,
    createdAt: r.created_at,
  }));
}
