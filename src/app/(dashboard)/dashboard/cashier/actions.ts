'use server';

import { z } from 'zod';
import { requireRole } from '@/lib/auth';
import { phoneSchema } from '@/lib/validators/auth';
import { getWalletBalance } from '@/lib/wallet';
import { createAdminClient } from '@/lib/supabase/admin';
import { computeBowlingDuration } from '@/lib/bowling';
import {
  lookupCustomerByPhone,
  createWalkInCustomer,
  computeSessionPrice,
  computeSessionPriceForStation,
  startCashierSession,
} from '@/lib/cashier';

const DEMO_TENANT_ID = '11111111-1111-1111-1111-111111111111';
const STAFF_ROLES = ['staff', 'manager', 'tenant_admin'] as const;

/** True if a game type's code marks it as bowling (players+games, not duration-based). */
async function isBowlingGameType(gameTypeId: string): Promise<boolean> {
  const admin = createAdminClient();
  const { data } = await admin.from('game_types').select('code').eq('id', gameTypeId).maybeSingle();
  return !!data?.code?.toLowerCase().includes('bowl');
}

const lookupSchema = z.object({ phone: phoneSchema });

export async function lookupCustomerAction(input: { phone: string }) {
  await requireRole(DEMO_TENANT_ID, [...STAFF_ROLES]);

  const parsed = lookupSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Invalid phone number' };
  }

  const customer = await lookupCustomerByPhone(parsed.data.phone);
  return { customer };
}

const createWalkInSchema = z.object({
  phone: phoneSchema,
  fullName: z.string().trim().min(2, 'Name too short').max(80),
});

export async function createWalkInCustomerAction(input: { phone: string; fullName: string }) {
  await requireRole(DEMO_TENANT_ID, [...STAFF_ROLES]);

  const parsed = createWalkInSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  }

  try {
    const customer = await createWalkInCustomer(parsed.data);
    return { customer: { id: customer.id, full_name: parsed.data.fullName, phone: parsed.data.phone } };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Failed to create customer' };
  }
}

const computePriceSchema = z.object({
  gameTypeId: z.string().uuid(),
  durationMinutes: z.number().int().min(5).max(480),
  branchId: z.string().uuid(),
});

export async function computeSessionPriceAction(input: {
  gameTypeId: string;
  durationMinutes: number;
  branchId: string;
}) {
  await requireRole(DEMO_TENANT_ID, [...STAFF_ROLES]);

  const parsed = computePriceSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  }

  try {
    const amountCents = await computeSessionPrice(parsed.data);
    return { amountCents };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Failed to compute price' };
  }
}

const computePriceForStationSchema = z.object({
  stationId: z.string().uuid(),
  durationMinutes: z.number().int().min(5).max(480).optional(),
  playerCount: z.number().int().min(1).max(8).optional(),
  gameCount: z.union([z.literal(1), z.literal(2)]).optional(),
});

export async function computeSessionPriceForStationAction(input: {
  stationId: string;
  durationMinutes?: number;
  playerCount?: number;
  gameCount?: 1 | 2;
}) {
  await requireRole(DEMO_TENANT_ID, [...STAFF_ROLES]);

  const parsed = computePriceForStationSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  }

  try {
    const admin = createAdminClient();
    const { data: station } = await admin.from('stations').select('game_type_id').eq('id', parsed.data.stationId).maybeSingle();
    if (!station) return { error: 'Station not found' };

    let durationMinutes = parsed.data.durationMinutes;
    if (await isBowlingGameType(station.game_type_id)) {
      if (!parsed.data.playerCount || !parsed.data.gameCount) return { error: 'Player count and game count are required' };
      const computed = await computeBowlingDuration({
        tenantId: DEMO_TENANT_ID,
        gameTypeId: station.game_type_id,
        playerCount: parsed.data.playerCount,
        gameCount: parsed.data.gameCount,
      });
      durationMinutes = computed.durationMinutes;
    }
    if (!durationMinutes) return { error: 'Duration is required' };

    const amountCents = await computeSessionPriceForStation({
      stationId: parsed.data.stationId,
      durationMinutes,
      playerCount: parsed.data.playerCount,
      gameCount: parsed.data.gameCount,
    });
    return { amountCents, durationMinutes };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Failed to compute price' };
  }
}

const walletBalanceSchema = z.object({ customerId: z.string().uuid() });

export async function getCustomerWalletBalanceAction(input: { customerId: string }) {
  await requireRole(DEMO_TENANT_ID, [...STAFF_ROLES]);

  const parsed = walletBalanceSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Invalid customer id' };
  }

  const balanceCents = await getWalletBalance(DEMO_TENANT_ID, parsed.data.customerId);
  return { balanceCents };
}

const startSessionSchema = z.object({
  branchId: z.string().uuid(),
  stationId: z.string().uuid(),
  customerId: z.string().uuid(),
  customerLabel: z.string().trim().min(1).max(80),
  durationMinutes: z.number().int().min(5).max(480).optional(),
  playerCount: z.number().int().min(1).max(8).optional(),
  gameCount: z.union([z.literal(1), z.literal(2)]).optional(),
  paymentMethod: z.enum(['cash', 'wallet']),
});

export async function startCashierSessionAction(input: {
  branchId: string;
  stationId: string;
  customerId: string;
  customerLabel: string;
  durationMinutes?: number;
  playerCount?: number;
  gameCount?: 1 | 2;
  paymentMethod: 'cash' | 'wallet';
}) {
  const ctx = await requireRole(DEMO_TENANT_ID, [...STAFF_ROLES]);

  const parsed = startSessionSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  }

  try {
    const admin = createAdminClient();
    const { data: station } = await admin.from('stations').select('game_type_id').eq('id', parsed.data.stationId).maybeSingle();
    if (!station) return { error: 'Station not found' };

    let durationMinutes = parsed.data.durationMinutes;
    let predictedDurationMinutes: number | undefined;
    if (await isBowlingGameType(station.game_type_id)) {
      if (!parsed.data.playerCount || !parsed.data.gameCount) return { error: 'Player count and game count are required' };
      const computed = await computeBowlingDuration({
        tenantId: DEMO_TENANT_ID,
        gameTypeId: station.game_type_id,
        playerCount: parsed.data.playerCount,
        gameCount: parsed.data.gameCount,
      });
      durationMinutes = computed.durationMinutes;
      predictedDurationMinutes = computed.predicted;
    }
    if (!durationMinutes) return { error: 'Duration is required' };

    const result = await startCashierSession({
      tenantId: DEMO_TENANT_ID,
      branchId: parsed.data.branchId,
      stationId: parsed.data.stationId,
      customerId: parsed.data.customerId,
      customerLabel: parsed.data.customerLabel,
      durationMinutes,
      paymentMethod: parsed.data.paymentMethod,
      actorId: ctx.userId,
      playerCount: parsed.data.playerCount,
      gameCount: parsed.data.gameCount,
      predictedDurationMinutes,
    });
    return { result };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Failed to start session' };
  }
}
