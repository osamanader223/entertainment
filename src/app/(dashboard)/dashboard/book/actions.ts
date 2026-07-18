'use server';

import { z } from 'zod';
import { requireAuth } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { computeSessionPriceForStation } from '@/lib/cashier';
import { computeBowlingDuration } from '@/lib/bowling';
import {
  createCustomerBooking,
  createScheduledBooking,
  cancelScheduledBooking,
  getCustomerUpcomingBookings,
  getAvailableStationsForWindow,
  getGameTypeSlots,
} from '@/lib/booking';
import { getVenueDateForNow, SLOT_MINUTES } from '@/lib/slots';
import { resolveOfferForCheckout } from '@/lib/offers';
import { getQueueableGameTypes } from '@/lib/queue';

const DEMO_TENANT_ID = '11111111-1111-1111-1111-111111111111';
const DEMO_BRANCH_ID = '22222222-2222-2222-2222-222222222222';

const priceSchema = z.object({
  stationId: z.string().uuid(),
  durationMinutes: z.number().int().min(5).max(480),
  playerCount: z.number().int().min(1).max(8).optional(),
  gameCount: z.union([z.literal(1), z.literal(2)]).optional(),
});

export async function getBookingPriceAction(input: {
  stationId: string;
  durationMinutes: number;
  playerCount?: number;
  gameCount?: 1 | 2;
}) {
  await requireAuth();

  const parsed = priceSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  }

  try {
    const amountCents = await computeSessionPriceForStation(parsed.data);
    return { amountCents };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Failed to compute price' };
  }
}

const previewOfferSchema = z.object({
  stationId: z.string().uuid(),
  durationMinutes: z.number().int().min(5).max(480),
  code: z.string().optional(),
  playerCount: z.number().int().min(1).max(8).optional(),
  gameCount: z.union([z.literal(1), z.literal(2)]).optional(),
});

export async function previewOfferAction(input: {
  stationId: string;
  durationMinutes: number;
  code?: string;
  playerCount?: number;
  gameCount?: 1 | 2;
}) {
  const ctx = await requireAuth();

  const parsed = previewOfferSchema.safeParse(input);
  if (!parsed.success) {
    return { applied: false, discountCents: 0, freeMinutes: 0, doublePoints: false, finalAmountCents: 0 };
  }

  try {
    const admin = createAdminClient();
    const { data: station } = await admin
      .from('stations')
      .select('game_type_id')
      .eq('id', parsed.data.stationId)
      .maybeSingle();

    if (!station) {
      return { applied: false, discountCents: 0, freeMinutes: 0, doublePoints: false, finalAmountCents: 0 };
    }

    const amountCents = await computeSessionPriceForStation({
      stationId: parsed.data.stationId,
      durationMinutes: parsed.data.durationMinutes,
      playerCount: parsed.data.playerCount,
      gameCount: parsed.data.gameCount,
    });

    const result = await resolveOfferForCheckout({
      tenantId: DEMO_TENANT_ID,
      customerId: ctx.userId,
      gameTypeId: station.game_type_id,
      amountCents,
      code: parsed.data.code,
    });

    return {
      applied: result.applied,
      offerNameEn: result.offer?.nameEn,
      offerNameAr: result.offer?.nameAr,
      discountType: result.offer?.discountType,
      discountCents: result.discountCents,
      freeMinutes: result.freeMinutes,
      doublePoints: result.doublePoints,
      finalAmountCents: result.finalAmountCents,
      reason: result.reason,
    };
  } catch {
    return { applied: false, discountCents: 0, freeMinutes: 0, doublePoints: false, finalAmountCents: 0 };
  }
}

const createBookingSchema = z.object({
  stationId: z.string().uuid(),
  durationMinutes: z.number().int().min(5).max(480),
  offerCode: z.string().optional(),
});

export async function createBookingAction(input: {
  stationId: string;
  durationMinutes: number;
  offerCode?: string;
}) {
  const ctx = await requireAuth();

  const parsed = createBookingSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  }

  try {
    const result = await createCustomerBooking({
      tenantId: DEMO_TENANT_ID,
      branchId: DEMO_BRANCH_ID,
      stationId: parsed.data.stationId,
      customerId: ctx.userId,
      durationMinutes: parsed.data.durationMinutes,
      paymentMethod: 'wallet',
      offerCode: parsed.data.offerCode,
    });
    return { ok: true as const, ...result };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : 'Failed to create booking' };
  }
}

// =====================================================================
// SCHEDULED BOOKINGS ("Book for later")
// =====================================================================

export async function getSchedulableGameTypesAction() {
  await requireAuth();
  try {
    const gameTypes = await getQueueableGameTypes(DEMO_TENANT_ID);
    return { ok: true as const, gameTypes };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : 'Failed to load game types' };
  }
}

const computeBowlingDurationInputSchema = z.object({
  gameTypeId: z.string().uuid(),
  playerCount: z.number().int().min(1).max(8),
  gameCount: z.union([z.literal(1), z.literal(2)]),
});

/**
 * Bowling doesn't have a duration button to click — the customer picks
 * players + single/double game instead, and this resolves the actual
 * bookable duration (clamped, rounded to the slot grid) that then drives
 * slot-fetching/pricing/booking exactly like any preset duration would.
 */
export async function computeBowlingDurationAction(input: { gameTypeId: string; playerCount: number; gameCount: 1 | 2 }) {
  await requireAuth();
  const parsed = computeBowlingDurationInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  }
  try {
    const result = await computeBowlingDuration({ tenantId: DEMO_TENANT_ID, ...parsed.data });
    return { ok: true as const, durationMinutes: result.durationMinutes };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : 'Failed to compute duration' };
  }
}

const availableStationsSchema = z.object({
  gameTypeId: z.string().uuid(),
  scheduledStartAt: z.string(),
  durationMinutes: z.number().int().min(5).max(480),
});

export async function getAvailableStationsAction(input: {
  gameTypeId: string;
  scheduledStartAt: string;
  durationMinutes: number;
}) {
  await requireAuth();
  const parsed = availableStationsSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0]?.message ?? 'Invalid input', stations: [] };

  try {
    const stations = await getAvailableStationsForWindow({
      tenantId: DEMO_TENANT_ID,
      branchId: DEMO_BRANCH_ID,
      ...parsed.data,
    });
    return { ok: true as const, stations };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : 'Failed to check availability', stations: [] };
  }
}

const createScheduledBookingSchema = z.object({
  stationId: z.string().uuid(),
  scheduledStartAt: z.string(),
  durationMinutes: z.number().int().min(5).max(480),
  offerCode: z.string().optional(),
  playerCount: z.number().int().min(1).max(8).optional(),
  gameCount: z.union([z.literal(1), z.literal(2)]).optional(),
});

export async function createScheduledBookingAction(input: {
  stationId: string;
  scheduledStartAt: string;
  durationMinutes: number;
  offerCode?: string;
  playerCount?: number;
  gameCount?: 1 | 2;
}) {
  const ctx = await requireAuth();

  const parsed = createScheduledBookingSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  }

  try {
    const result = await createScheduledBooking({
      tenantId: DEMO_TENANT_ID,
      branchId: DEMO_BRANCH_ID,
      stationId: parsed.data.stationId,
      customerId: ctx.userId,
      scheduledStartAt: parsed.data.scheduledStartAt,
      durationMinutes: parsed.data.durationMinutes,
      playerCount: parsed.data.playerCount,
      gameCount: parsed.data.gameCount,
      offerCode: parsed.data.offerCode,
    });
    return { ok: true as const, ...result };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : 'Failed to create reservation' };
  }
}

// =====================================================================
// CINEMA-STYLE SLOT GRID
// =====================================================================

/** Venue hours + today's venue-day, so the date strip can default correctly. */
export async function getBookingContextAction() {
  await requireAuth();
  try {
    const admin = createAdminClient();
    const [{ data: branch, error: branchError }, { data: tenant, error: tenantError }] = await Promise.all([
      admin.from('branches').select('opens_at, closes_at').eq('id', DEMO_BRANCH_ID).maybeSingle(),
      admin.from('tenants').select('timezone').eq('id', DEMO_TENANT_ID).maybeSingle(),
    ]);
    if (branchError || !branch) throw branchError ?? new Error('Branch not found');
    if (tenantError || !tenant) throw tenantError ?? new Error('Tenant not found');

    return {
      ok: true as const,
      opensAt: branch.opens_at,
      closesAt: branch.closes_at,
      timezone: tenant.timezone,
      todayVenueDate: getVenueDateForNow(branch.opens_at, branch.closes_at, tenant.timezone),
    };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : 'Failed to load venue hours' };
  }
}

const gameTypeSlotsSchema = z.object({
  gameTypeId: z.string().uuid(),
  venueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  durationMinutes: z.number().int().min(SLOT_MINUTES).max(480),
});

export async function getGameTypeSlotsAction(input: {
  gameTypeId: string;
  venueDate: string;
  durationMinutes: number;
}) {
  await requireAuth();
  const parsed = gameTypeSlotsSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? 'Invalid input', stations: [] };
  }

  try {
    const stations = await getGameTypeSlots({
      tenantId: DEMO_TENANT_ID,
      branchId: DEMO_BRANCH_ID,
      ...parsed.data,
    });
    return { ok: true as const, stations };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : 'Failed to load slots', stations: [] };
  }
}

export async function getMyUpcomingBookingsAction() {
  const ctx = await requireAuth();
  try {
    const bookings = await getCustomerUpcomingBookings(DEMO_TENANT_ID, ctx.userId);
    return { ok: true as const, bookings };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : 'Failed to load bookings' };
  }
}

const cancelBookingSchema = z.object({ bookingId: z.string().uuid() });

export async function cancelMyBookingAction(input: { bookingId: string }) {
  const ctx = await requireAuth();
  const parsed = cancelBookingSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: 'Invalid input' };

  try {
    const result = await cancelScheduledBooking(parsed.data.bookingId, DEMO_TENANT_ID, ctx.userId, false);
    return { ok: true as const, ...result };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : 'Failed to cancel booking' };
  }
}
