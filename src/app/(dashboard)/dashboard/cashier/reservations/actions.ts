'use server';

import { z } from 'zod';
import { requireRole } from '@/lib/auth';
import { getReservationBoard } from '@/lib/cashier-reservations';
import {
  markBookingPresent,
  startScheduledBookingSession,
  markBookingNoShow,
  cancelScheduledBooking,
} from '@/lib/booking';

const DEMO_TENANT_ID = '11111111-1111-1111-1111-111111111111';
const STAFF_ROLES = ['staff', 'manager', 'tenant_admin'] as const;

const branchSchema = z.object({ branchId: z.string().uuid(), date: z.string().optional() });

export async function getReservationBoardAction(input: { branchId: string; date?: string }) {
  await requireRole(DEMO_TENANT_ID, [...STAFF_ROLES]);
  const parsed = branchSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: 'Invalid input' };
  try {
    const reservations = await getReservationBoard(DEMO_TENANT_ID, parsed.data.branchId, parsed.data.date);
    return { ok: true as const, reservations };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : 'Failed to load reservations' };
  }
}

const bookingIdSchema = z.object({ bookingId: z.string().uuid() });

export async function markPresentAction(input: { bookingId: string }) {
  const ctx = await requireRole(DEMO_TENANT_ID, [...STAFF_ROLES]);
  const parsed = bookingIdSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: 'Invalid input' };
  try {
    await markBookingPresent(parsed.data.bookingId, DEMO_TENANT_ID, ctx.userId);
    return { ok: true as const };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : 'Failed' };
  }
}

export async function startNowAction(input: { bookingId: string }) {
  const ctx = await requireRole(DEMO_TENANT_ID, [...STAFF_ROLES]);
  const parsed = bookingIdSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: 'Invalid input' };
  try {
    const result = await startScheduledBookingSession(parsed.data.bookingId, DEMO_TENANT_ID, ctx.userId, false);
    return { ok: true as const, sessionId: result.sessionId };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : 'Failed' };
  }
}

export async function noShowAction(input: { bookingId: string }) {
  const ctx = await requireRole(DEMO_TENANT_ID, [...STAFF_ROLES]);
  const parsed = bookingIdSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: 'Invalid input' };
  try {
    await markBookingNoShow(parsed.data.bookingId, DEMO_TENANT_ID, ctx.userId);
    return { ok: true as const };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : 'Failed' };
  }
}

export async function cancelReservationAction(input: { bookingId: string }) {
  const ctx = await requireRole(DEMO_TENANT_ID, [...STAFF_ROLES]);
  const parsed = bookingIdSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: 'Invalid input' };
  try {
    const result = await cancelScheduledBooking(parsed.data.bookingId, DEMO_TENANT_ID, ctx.userId, true);
    return { ok: true as const, ...result };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : 'Failed' };
  }
}
