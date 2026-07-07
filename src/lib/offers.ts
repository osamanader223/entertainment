import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';

export interface OfferRow {
  id: string;
  tenant_id: string;
  code: string;
  name: string;
  description: string | null;
  description_ar: string | null;
  description_en: string | null;
  discount_type: 'percent' | 'fixed' | 'free_minutes' | 'double_points';
  discount_value: number;
  redemption_type: 'code' | 'auto';
  applies_to_game_type_id: string | null;
  min_amount_cents: number | null;
  max_uses: number | null;
  max_uses_per_customer: number | null;
  uses_count: number;
  min_tier: string | null;
  valid_from: string | null;
  valid_to: string | null;
  is_active: boolean;
  created_at: string;
}

export async function listOffers(tenantId: string): Promise<OfferRow[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('offers')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as OfferRow[];
}

export interface CreateOfferInput {
  tenantId: string;
  code?: string | null;
  nameAr: string;
  nameEn: string;
  descriptionAr?: string | null;
  descriptionEn?: string | null;
  discountType: 'percent' | 'fixed' | 'free_minutes' | 'double_points';
  discountValue: number;
  redemptionType: 'code' | 'auto';
  appliesToGameTypeId?: string | null;
  minAmountCents?: number | null;
  maxUses?: number | null;
  maxUsesPerCustomer?: number | null;
  minTier?: string | null;
  validFrom?: string | null;
  validTo?: string | null;
  isActive: boolean;
  actorId: string;
}

export async function createOffer(input: CreateOfferInput): Promise<{ offerId: string }> {
  const admin = createAdminClient();

  // code is required for code-based offers, null for auto offers
  const code = input.redemptionType === 'code'
    ? input.code?.toUpperCase().trim() ?? ''
    : (input.code?.trim() ? input.code.trim().toUpperCase() : null);

  if (input.redemptionType === 'code' && !code) {
    throw new Error('Promo code is required for code-based offers');
  }

  const { data, error } = await admin
    .from('offers')
    .insert({
      tenant_id: input.tenantId,
      code,
      name: input.nameEn,
      description: input.descriptionEn ?? null,
      description_ar: input.descriptionAr ?? null,
      description_en: input.descriptionEn ?? null,
      discount_type: input.discountType,
      discount_value: input.discountValue,
      redemption_type: input.redemptionType,
      applies_to_game_type_id: input.appliesToGameTypeId ?? null,
      min_amount_cents: input.minAmountCents ?? null,
      max_uses: input.maxUses ?? null,
      max_uses_per_customer: input.maxUsesPerCustomer ?? null,
      min_tier: input.minTier ?? null,
      valid_from: input.validFrom ?? null,
      valid_to: input.validTo ?? null,
      is_active: input.isActive,
    } as never)
    .select('id')
    .single();

  if (error) throw error;
  const offerId = (data as unknown as { id: string }).id;

  await admin.from('activity_log').insert({
    tenant_id: input.tenantId,
    actor_id: input.actorId,
    actor_role: 'manager' as never,
    action: 'offer.created',
    entity_type: 'offer',
    entity_id: offerId,
    after: { code, name: input.nameEn, discount_type: input.discountType } as never,
  });

  return { offerId };
}

export type UpdateOfferInput = Partial<Omit<CreateOfferInput, 'tenantId' | 'actorId'>>;

export async function updateOffer(
  offerId: string,
  tenantId: string,
  patch: UpdateOfferInput,
  actorId: string,
): Promise<void> {
  const admin = createAdminClient();

  const update: Record<string, unknown> = {};
  if (patch.nameEn !== undefined) update.name = patch.nameEn;
  if (patch.descriptionEn !== undefined) update.description = patch.descriptionEn;
  if (patch.descriptionEn !== undefined) update.description_en = patch.descriptionEn;
  if (patch.descriptionAr !== undefined) update.description_ar = patch.descriptionAr;
  if (patch.code !== undefined) update.code = patch.code ? patch.code.toUpperCase().trim() : null;
  if (patch.discountType !== undefined) update.discount_type = patch.discountType;
  if (patch.discountValue !== undefined) update.discount_value = patch.discountValue;
  if (patch.redemptionType !== undefined) update.redemption_type = patch.redemptionType;
  if (patch.appliesToGameTypeId !== undefined) update.applies_to_game_type_id = patch.appliesToGameTypeId;
  if (patch.minAmountCents !== undefined) update.min_amount_cents = patch.minAmountCents;
  if (patch.maxUses !== undefined) update.max_uses = patch.maxUses;
  if (patch.maxUsesPerCustomer !== undefined) update.max_uses_per_customer = patch.maxUsesPerCustomer;
  if (patch.minTier !== undefined) update.min_tier = patch.minTier;
  if (patch.validFrom !== undefined) update.valid_from = patch.validFrom;
  if (patch.validTo !== undefined) update.valid_to = patch.validTo;
  if (patch.isActive !== undefined) update.is_active = patch.isActive;

  const { error } = await admin
    .from('offers')
    .update(update as never)
    .eq('id', offerId)
    .eq('tenant_id', tenantId);

  if (error) throw error;

  await admin.from('activity_log').insert({
    tenant_id: tenantId,
    actor_id: actorId,
    actor_role: 'manager' as never,
    action: 'offer.updated',
    entity_type: 'offer',
    entity_id: offerId,
    after: update as never,
  });
}

export async function setOfferActive(
  offerId: string,
  tenantId: string,
  isActive: boolean,
  actorId: string,
): Promise<void> {
  const admin = createAdminClient();

  const { error } = await admin
    .from('offers')
    .update({ is_active: isActive } as never)
    .eq('id', offerId)
    .eq('tenant_id', tenantId);

  if (error) throw error;

  await admin.from('activity_log').insert({
    tenant_id: tenantId,
    actor_id: actorId,
    actor_role: 'manager' as never,
    action: isActive ? 'offer.activated' : 'offer.deactivated',
    entity_type: 'offer',
    entity_id: offerId,
    after: { is_active: isActive } as never,
  });
}

export async function deleteOffer(
  offerId: string,
  tenantId: string,
  actorId: string,
): Promise<void> {
  const admin = createAdminClient();

  await admin.from('activity_log').insert({
    tenant_id: tenantId,
    actor_id: actorId,
    actor_role: 'manager' as never,
    action: 'offer.deleted',
    entity_type: 'offer',
    entity_id: offerId,
    after: null,
  });

  const { error } = await admin
    .from('offers')
    .delete()
    .eq('id', offerId)
    .eq('tenant_id', tenantId);

  if (error) throw error;
}

export interface ValidateOfferResult {
  valid: boolean;
  reason?: string;
  offer?: {
    id: string;
    nameEn: string;
    nameAr: string;
    discountType: string;
    discountValue: number;
    redemptionType: string;
  };
  discountCents?: number;
  finalAmountCents?: number;
}

/**
 * Read-only preview/validation — does NOT increment uses_count.
 * Actual recording happens when booking is completed.
 * // TODO(integration) booking.ts / queue.ts will call recordOfferRedemption() after payment succeeds.
 */
export async function validateAndPreviewOffer(input: {
  tenantId: string;
  customerId: string;
  gameTypeId: string;
  amountCents: number;
  code?: string;
}): Promise<ValidateOfferResult> {
  const admin = createAdminClient();

  let offerQuery = admin
    .from('offers')
    .select('*')
    .eq('tenant_id', input.tenantId)
    .eq('is_active', true);

  if (input.code) {
    offerQuery = offerQuery.eq('code', input.code.toUpperCase().trim());
  } else {
    // Auto-apply offers only
    offerQuery = offerQuery.eq('redemption_type' as never, 'auto');
  }

  const { data: offersRaw } = await offerQuery;
  const offers = (offersRaw ?? []) as unknown as OfferRow[];

  if (offers.length === 0) {
    return { valid: false, reason: input.code ? 'not_found' : 'no_auto_offer' };
  }

  const offer = offers[0];
  const now = new Date();

  // Valid date range
  if (offer.valid_from && new Date(offer.valid_from) > now) {
    return { valid: false, reason: 'not_started' };
  }
  if (offer.valid_to && new Date(offer.valid_to) < now) {
    return { valid: false, reason: 'expired' };
  }

  // Total usage limit
  if (offer.max_uses !== null && offer.uses_count >= offer.max_uses) {
    return { valid: false, reason: 'usage_limit_reached' };
  }

  // Per-customer usage limit
  if (offer.max_uses_per_customer !== null) {
    const { count } = await admin
      .from('offer_redemptions' as never)
      .select('id', { count: 'exact', head: true })
      .eq('offer_id', offer.id)
      .eq('customer_id', input.customerId);

    if ((count ?? 0) >= offer.max_uses_per_customer) {
      return { valid: false, reason: 'usage_limit_reached' };
    }
  }

  // Minimum spend
  if (offer.min_amount_cents !== null && input.amountCents < offer.min_amount_cents) {
    return { valid: false, reason: 'min_amount_not_met' };
  }

  // Game type restriction
  if (offer.applies_to_game_type_id !== null && offer.applies_to_game_type_id !== input.gameTypeId) {
    return { valid: false, reason: 'wrong_game' };
  }

  // Tier check (requires fetching loyalty account)
  if (offer.min_tier) {
    const tierOrder = ['silver', 'gold', 'platinum', 'diamond'];
    const minIdx = tierOrder.indexOf(offer.min_tier);
    const { data: loyalty } = await admin
      .from('loyalty_accounts')
      .select('tier')
      .eq('tenant_id', input.tenantId)
      .eq('customer_id', input.customerId)
      .maybeSingle();
    const customerTier = (loyalty as unknown as { tier?: string } | null)?.tier ?? 'silver';
    const customerIdx = tierOrder.indexOf(customerTier);
    if (customerIdx < minIdx) {
      return { valid: false, reason: 'tier_too_low' };
    }
  }

  // Compute discount
  let discountCents = 0;
  if (offer.discount_type === 'percent') {
    discountCents = Math.round((input.amountCents * offer.discount_value) / 100);
  } else if (offer.discount_type === 'fixed') {
    discountCents = Math.min(offer.discount_value, input.amountCents);
  }
  // free_minutes / double_points: discount on price is 0 here; handled elsewhere

  return {
    valid: true,
    offer: {
      id: offer.id,
      nameEn: offer.name,
      nameAr: (offer.description_ar ?? offer.name),
      discountType: offer.discount_type,
      discountValue: offer.discount_value,
      redemptionType: offer.redemption_type,
    },
    discountCents,
    finalAmountCents: input.amountCents - discountCents,
  };
}

export interface ResolveOfferResult {
  applied: boolean;
  offer?: {
    id: string;
    nameEn: string;
    nameAr: string;
    discountType: string;
    discountValue: number;
  };
  discountCents: number;
  freeMinutes: number;
  doublePoints: boolean;
  finalAmountCents: number;
  reason?: string;
}

/**
 * Find the best auto-apply offer for a given checkout context.
 * Iterates all valid auto offers, picks the one with the most value
 * (highest discountCents; ties broken by freeMinutes).
 */
export async function findBestAutoOffer(input: {
  tenantId: string;
  customerId: string;
  gameTypeId: string;
  amountCents: number;
}): Promise<ResolveOfferResult | null> {
  const admin = createAdminClient();

  const { data: offersRaw } = await admin
    .from('offers')
    .select('*')
    .eq('tenant_id', input.tenantId)
    .eq('is_active', true)
    .eq('redemption_type' as never, 'auto');

  const offers = (offersRaw ?? []) as unknown as OfferRow[];
  if (offers.length === 0) return null;

  const now = new Date();
  const tierOrder = ['silver', 'gold', 'platinum', 'diamond'];

  // Fetch customer tier once (reused for tier-gated offers)
  const { data: loyalty } = await admin
    .from('loyalty_accounts')
    .select('tier')
    .eq('tenant_id', input.tenantId)
    .eq('customer_id', input.customerId)
    .maybeSingle();
  const customerTierIdx = tierOrder.indexOf(
    (loyalty as unknown as { tier?: string } | null)?.tier ?? 'silver',
  );

  const candidates: Array<{ offer: OfferRow; discountCents: number; freeMinutes: number }> = [];

  for (const offer of offers) {
    if (offer.valid_from && new Date(offer.valid_from) > now) continue;
    if (offer.valid_to && new Date(offer.valid_to) < now) continue;
    if (offer.max_uses !== null && offer.uses_count >= offer.max_uses) continue;
    if (offer.min_amount_cents !== null && input.amountCents < offer.min_amount_cents) continue;
    if (offer.applies_to_game_type_id !== null && offer.applies_to_game_type_id !== input.gameTypeId) continue;
    if (offer.min_tier) {
      if (customerTierIdx < tierOrder.indexOf(offer.min_tier)) continue;
    }
    if (offer.max_uses_per_customer !== null) {
      const { count } = await admin
        .from('offer_redemptions' as never)
        .select('id', { count: 'exact', head: true })
        .eq('offer_id', offer.id)
        .eq('customer_id', input.customerId);
      if ((count ?? 0) >= offer.max_uses_per_customer) continue;
    }

    let discountCents = 0;
    let freeMinutes = 0;
    if (offer.discount_type === 'percent') {
      discountCents = Math.round((input.amountCents * offer.discount_value) / 100);
    } else if (offer.discount_type === 'fixed') {
      discountCents = Math.min(offer.discount_value, input.amountCents);
    } else if (offer.discount_type === 'free_minutes') {
      freeMinutes = offer.discount_value;
    }
    candidates.push({ offer, discountCents, freeMinutes });
  }

  if (candidates.length === 0) return null;

  candidates.sort((a, b) =>
    b.discountCents !== a.discountCents
      ? b.discountCents - a.discountCents
      : b.freeMinutes - a.freeMinutes,
  );

  const best = candidates[0];
  return {
    applied: true,
    offer: {
      id: best.offer.id,
      nameEn: best.offer.name,
      nameAr: best.offer.description_ar ?? best.offer.name,
      discountType: best.offer.discount_type,
      discountValue: best.offer.discount_value,
    },
    discountCents: best.discountCents,
    freeMinutes: best.freeMinutes,
    doublePoints: best.offer.discount_type === 'double_points',
    finalAmountCents: input.amountCents - best.discountCents,
  };
}

/**
 * Resolve which offer (if any) applies at checkout.
 * - Code given → code takes precedence; if invalid, return full price + reason (no auto fallback).
 * - No code → try auto offers; return best match or full price.
 */
export async function resolveOfferForCheckout(input: {
  tenantId: string;
  customerId: string;
  gameTypeId: string;
  amountCents: number;
  code?: string;
}): Promise<ResolveOfferResult> {
  const noOffer: ResolveOfferResult = {
    applied: false,
    discountCents: 0,
    freeMinutes: 0,
    doublePoints: false,
    finalAmountCents: input.amountCents,
  };

  if (input.code) {
    const v = await validateAndPreviewOffer({
      tenantId: input.tenantId,
      customerId: input.customerId,
      gameTypeId: input.gameTypeId,
      amountCents: input.amountCents,
      code: input.code,
    });
    if (!v.valid || !v.offer) return { ...noOffer, reason: v.reason };

    const isFreeMinutes = v.offer.discountType === 'free_minutes';
    const isDoublePoints = v.offer.discountType === 'double_points';
    const discountCents = isFreeMinutes || isDoublePoints ? 0 : (v.discountCents ?? 0);
    const freeMinutes = isFreeMinutes ? v.offer.discountValue : 0;

    return {
      applied: true,
      offer: v.offer,
      discountCents,
      freeMinutes,
      doublePoints: isDoublePoints,
      finalAmountCents: input.amountCents - discountCents,
    };
  }

  return (await findBestAutoOffer(input)) ?? noOffer;
}

export async function recordOfferRedemption(input: {
  tenantId: string;
  offerId: string;
  customerId: string;
  bookingId?: string;
  sessionId?: string;
  discountCents: number;
}): Promise<void> {
  const admin = createAdminClient();

  await admin.from('offer_redemptions' as never).insert({
    tenant_id: input.tenantId,
    offer_id: input.offerId,
    customer_id: input.customerId,
    booking_id: input.bookingId ?? null,
    session_id: input.sessionId ?? null,
    discount_applied_cents: input.discountCents,
  } as never);

  // Increment uses_count
  const { data: current } = await admin
    .from('offers')
    .select('uses_count')
    .eq('id', input.offerId)
    .single();

  const currentCount = (current as unknown as { uses_count?: number } | null)?.uses_count ?? 0;
  await admin
    .from('offers')
    .update({ uses_count: currentCount + 1 } as never)
    .eq('id', input.offerId);

  await admin.from('activity_log').insert({
    tenant_id: input.tenantId,
    actor_id: input.customerId,
    actor_role: 'customer' as never,
    action: 'offer.redeemed',
    entity_type: 'offer',
    entity_id: input.offerId,
    after: { discount_applied_cents: input.discountCents } as never,
  });
}
