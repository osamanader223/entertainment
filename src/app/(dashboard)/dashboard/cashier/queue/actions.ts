'use server';

import { z } from 'zod';
import { requireRole } from '@/lib/auth';
import { callNextTicket, seatTicket, cancelTicket, expireTicket, getBranchQueueOverview } from '@/lib/queue';

const DEMO_TENANT_ID = '11111111-1111-1111-1111-111111111111';
const DEMO_BRANCH_ID = '22222222-2222-2222-2222-222222222222';
const STAFF_ROLES = ['staff', 'manager', 'tenant_admin'] as const;

export async function listQueueAction() {
  await requireRole(DEMO_TENANT_ID, [...STAFF_ROLES]);

  try {
    const groups = await getBranchQueueOverview(DEMO_TENANT_ID, DEMO_BRANCH_ID);
    return { ok: true as const, groups };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : 'Failed to load queue' };
  }
}

const callNextSchema = z.object({ gameTypeId: z.string().uuid() });

export async function callNextTicketAction(input: { gameTypeId: string }) {
  const ctx = await requireRole(DEMO_TENANT_ID, [...STAFF_ROLES]);

  const parsed = callNextSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  }

  try {
    const result = await callNextTicket({
      tenantId: DEMO_TENANT_ID,
      branchId: DEMO_BRANCH_ID,
      gameTypeId: parsed.data.gameTypeId,
      actorId: ctx.userId,
    });
    if (!result) return { ok: false as const, error: 'No one is waiting for this game' };
    return { ok: true as const, ticket: result };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : 'Failed to call next ticket' };
  }
}

const seatSchema = z.object({
  ticketId: z.string().uuid(),
  stationId: z.string().uuid(),
  durationMinutes: z.number().int().min(5).max(480),
});

export async function seatTicketAction(input: { ticketId: string; stationId: string; durationMinutes: number }) {
  const ctx = await requireRole(DEMO_TENANT_ID, [...STAFF_ROLES]);

  const parsed = seatSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  }

  try {
    const result = await seatTicket({
      tenantId: DEMO_TENANT_ID,
      branchId: DEMO_BRANCH_ID,
      ticketId: parsed.data.ticketId,
      stationId: parsed.data.stationId,
      durationMinutes: parsed.data.durationMinutes,
      actorId: ctx.userId,
    });
    return { ok: true as const, ...result };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : 'Failed to seat ticket' };
  }
}

const ticketIdSchema = z.object({ ticketId: z.string().uuid() });

export async function expireTicketAction(input: { ticketId: string }) {
  const ctx = await requireRole(DEMO_TENANT_ID, [...STAFF_ROLES]);

  const parsed = ticketIdSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  }

  try {
    await expireTicket({ tenantId: DEMO_TENANT_ID, ticketId: parsed.data.ticketId, actorId: ctx.userId });
    return { ok: true as const };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : 'Failed to mark as no-show' };
  }
}

export async function staffCancelTicketAction(input: { ticketId: string }) {
  const ctx = await requireRole(DEMO_TENANT_ID, [...STAFF_ROLES]);

  const parsed = ticketIdSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  }

  try {
    const result = await cancelTicket({
      tenantId: DEMO_TENANT_ID,
      ticketId: parsed.data.ticketId,
      actorId: ctx.userId,
      byStaff: true,
    });
    return { ok: true as const, ...result };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : 'Failed to cancel ticket' };
  }
}
