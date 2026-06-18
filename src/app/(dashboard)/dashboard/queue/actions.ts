'use server';

import { z } from 'zod';
import { requireAuth } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { computeSessionPrice } from '@/lib/cashier';
import { joinQueue, cancelTicket, getCustomerQueueTickets } from '@/lib/queue';

const DEMO_TENANT_ID = '11111111-1111-1111-1111-111111111111';
const DEMO_BRANCH_ID = '22222222-2222-2222-2222-222222222222';

const priceSchema = z.object({
  gameTypeId: z.string().uuid(),
  durationMinutes: z.number().int().min(5).max(480),
});

export async function getQueuePriceAction(input: { gameTypeId: string; durationMinutes: number }) {
  await requireAuth();

  const parsed = priceSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  }

  try {
    const amountCents = await computeSessionPrice({
      gameTypeId: parsed.data.gameTypeId,
      durationMinutes: parsed.data.durationMinutes,
      branchId: DEMO_BRANCH_ID,
    });
    return { amountCents };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Failed to compute price' };
  }
}

const joinQueueSchema = z.object({
  gameTypeId: z.string().uuid(),
  playerCount: z.number().int().min(1).max(20),
  durationMinutes: z.number().int().min(5).max(480),
});

export async function joinQueueAction(input: { gameTypeId: string; playerCount: number; durationMinutes: number }) {
  const ctx = await requireAuth();

  const parsed = joinQueueSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  }

  try {
    const result = await joinQueue({
      tenantId: DEMO_TENANT_ID,
      branchId: DEMO_BRANCH_ID,
      gameTypeId: parsed.data.gameTypeId,
      customerId: ctx.userId,
      playerCount: parsed.data.playerCount,
      durationMinutes: parsed.data.durationMinutes,
    });
    return { ok: true as const, ...result };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : 'Failed to join queue' };
  }
}

const cancelSchema = z.object({ ticketId: z.string().uuid() });

export async function cancelMyTicketAction(input: { ticketId: string }) {
  const ctx = await requireAuth();

  const parsed = cancelSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  }

  const admin = createAdminClient();
  const { data: ticket, error: ticketError } = await admin
    .from('queue_tickets')
    .select('id, customer_id')
    .eq('id', parsed.data.ticketId)
    .maybeSingle();

  if (ticketError || !ticket || ticket.customer_id !== ctx.userId) {
    return { ok: false as const, error: 'Ticket not found' };
  }

  try {
    const result = await cancelTicket({
      tenantId: DEMO_TENANT_ID,
      ticketId: parsed.data.ticketId,
      actorId: ctx.userId,
      byStaff: false,
    });
    return { ok: true as const, ...result };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : 'Failed to cancel ticket' };
  }
}

export async function getMyTicketsAction() {
  const ctx = await requireAuth();

  try {
    const tickets = await getCustomerQueueTickets(DEMO_TENANT_ID, ctx.userId);
    return { ok: true as const, tickets };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : 'Failed to load tickets' };
  }
}
