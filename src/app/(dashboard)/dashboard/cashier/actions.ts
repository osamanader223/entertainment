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
import { openShift, getOpenShift, closeShift, getShiftSummary } from '@/lib/shifts';
import { openTab, getOpenTabs, getTab, voidTab, settleTab } from '@/lib/tabs';

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
  paymentMethod: z.enum(['cash', 'wallet']).optional(),
  tabId: z.string().uuid().optional(),
});

export async function startCashierSessionAction(input: {
  branchId: string;
  stationId: string;
  customerId: string;
  customerLabel: string;
  durationMinutes?: number;
  playerCount?: number;
  gameCount?: 1 | 2;
  paymentMethod?: 'cash' | 'wallet';
  tabId?: string;
}) {
  const ctx = await requireRole(DEMO_TENANT_ID, [...STAFF_ROLES]);

  const parsed = startSessionSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  }
  if (!parsed.data.tabId && !parsed.data.paymentMethod) {
    return { error: 'Choose pay now or add to tab' };
  }

  try {
    const shift = await getOpenShift(DEMO_TENANT_ID, parsed.data.branchId, ctx.userId);
    if (!shift) return { error: 'no_open_shift' };

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
      shiftId: shift.id,
      tabId: parsed.data.tabId,
      playerCount: parsed.data.playerCount,
      gameCount: parsed.data.gameCount,
      predictedDurationMinutes,
    });
    return { result };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Failed to start session' };
  }
}

// ---------------------------------------------------------------------
// Shifts
// ---------------------------------------------------------------------

export async function getOpenShiftAction(input: { branchId: string }) {
  const ctx = await requireRole(DEMO_TENANT_ID, [...STAFF_ROLES]);
  try {
    const shift = await getOpenShift(DEMO_TENANT_ID, input.branchId, ctx.userId);
    return { shift };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Failed to load shift' };
  }
}

const openShiftSchema = z.object({
  branchId: z.string().uuid(),
  openingFloatCents: z.number().int().min(0).max(10_000_000),
});

export async function openShiftAction(input: { branchId: string; openingFloatCents: number }) {
  const ctx = await requireRole(DEMO_TENANT_ID, [...STAFF_ROLES]);
  const parsed = openShiftSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' };

  try {
    const result = await openShift({
      tenantId: DEMO_TENANT_ID,
      branchId: parsed.data.branchId,
      cashierId: ctx.userId,
      openingFloatCents: parsed.data.openingFloatCents,
    });
    return { result };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Failed to open shift' };
  }
}

const closeShiftSchema = z.object({
  shiftId: z.string().uuid(),
  countedCashCents: z.number().int().min(0).max(50_000_000),
  closeNote: z.string().trim().max(500).optional(),
});

export async function closeShiftAction(input: { shiftId: string; countedCashCents: number; closeNote?: string }) {
  const ctx = await requireRole(DEMO_TENANT_ID, [...STAFF_ROLES]);
  const parsed = closeShiftSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' };

  try {
    const result = await closeShift({ ...parsed.data, actorId: ctx.userId });
    return { result };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Failed to close shift' };
  }
}

export async function getShiftSummaryAction(input: { shiftId: string }) {
  await requireRole(DEMO_TENANT_ID, [...STAFF_ROLES]);
  try {
    const summary = await getShiftSummary(input.shiftId);
    return { summary };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Failed to load shift summary' };
  }
}

// ---------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------

const openTabSchema = z.object({
  branchId: z.string().uuid(),
  customerId: z.string().uuid().optional(),
  label: z.string().trim().max(80).optional(),
});

export async function openTabAction(input: { branchId: string; customerId?: string; label?: string }) {
  const ctx = await requireRole(DEMO_TENANT_ID, [...STAFF_ROLES]);
  const parsed = openTabSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' };

  try {
    const shift = await getOpenShift(DEMO_TENANT_ID, parsed.data.branchId, ctx.userId);
    if (!shift) return { error: 'no_open_shift' };

    const result = await openTab({
      tenantId: DEMO_TENANT_ID,
      branchId: parsed.data.branchId,
      shiftId: shift.id,
      openedBy: ctx.userId,
      customerId: parsed.data.customerId,
      label: parsed.data.label,
    });
    return { result };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Failed to open tab' };
  }
}

export async function getOpenTabsAction(input: { branchId: string }) {
  await requireRole(DEMO_TENANT_ID, [...STAFF_ROLES]);
  try {
    const tabs = await getOpenTabs(DEMO_TENANT_ID, input.branchId);
    return { tabs };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Failed to load tabs' };
  }
}

export async function getTabAction(input: { tabId: string }) {
  await requireRole(DEMO_TENANT_ID, [...STAFF_ROLES]);
  try {
    const tab = await getTab(input.tabId);
    return { tab };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Failed to load tab' };
  }
}

const voidTabSchema = z.object({ tabId: z.string().uuid(), reason: z.string().trim().min(1).max(200) });

export async function voidTabAction(input: { tabId: string; reason: string }) {
  const ctx = await requireRole(DEMO_TENANT_ID, [...STAFF_ROLES]);
  const parsed = voidTabSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' };

  try {
    await voidTab(parsed.data.tabId, parsed.data.reason, ctx.userId);
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Failed to void tab' };
  }
}

const settleTabSchema = z.object({
  tabId: z.string().uuid(),
  payments: z
    .array(
      z.object({
        method: z.enum(['cash', 'card', 'wallet']),
        amountCents: z.number().int().positive(),
      })
    )
    .min(1),
});

export async function settleTabAction(input: {
  tabId: string;
  payments: Array<{ method: 'cash' | 'card' | 'wallet'; amountCents: number }>;
}) {
  const ctx = await requireRole(DEMO_TENANT_ID, [...STAFF_ROLES]);
  const parsed = settleTabSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' };

  try {
    const result = await settleTab({ tabId: parsed.data.tabId, payments: parsed.data.payments, actorId: ctx.userId });
    return { result };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Failed to settle tab' };
  }
}
