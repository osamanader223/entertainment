'use server';
import { z } from 'zod';
import { requireAuth, userHasAnyRole } from '@/lib/auth';
import {
  listStations, createStation, updateStation,
  setStationStatus, deleteStation, updateStationPositions,
} from '@/lib/stations-admin';

const DEMO_TENANT_ID = '11111111-1111-1111-1111-111111111111';
const DEMO_BRANCH_ID = '22222222-2222-2222-2222-222222222222';
const ADMIN_ROLES = ['manager', 'tenant_admin'] as const;

async function requireAdminCtx() {
  const ctx = await requireAuth();
  if (!userHasAnyRole(ctx, [...ADMIN_ROLES]) && !ctx.isSuperAdmin) throw new Error('Forbidden');
  return ctx;
}

export async function listStationsAction() {
  try {
    await requireAdminCtx();
    const stations = await listStations(DEMO_TENANT_ID, DEMO_BRANCH_ID);
    return { ok: true as const, stations };
  } catch (err) { return { ok: false as const, error: String(err) }; }
}

const stationSchema = z.object({
  gameTypeId: z.string().uuid(),
  code: z.string().min(1).max(20),
  displayName: z.string().min(1).max(100),
  iftttEventOn: z.string().max(100).optional().nullable(),
  iftttEventOff: z.string().max(100).optional().nullable(),
  iftttEventAlert: z.string().max(100).optional().nullable(),
  notes: z.string().max(500).optional().nullable(),
  isActive: z.boolean(),
});

export async function createStationAction(raw: unknown) {
  try {
    const ctx = await requireAdminCtx();
    const input = stationSchema.parse(raw);
    const result = await createStation({ ...input, tenantId: DEMO_TENANT_ID, branchId: DEMO_BRANCH_ID, actorId: ctx.userId });
    return { ok: true as const, stationId: result.stationId };
  } catch (err) { return { ok: false as const, error: String(err) }; }
}

export async function updateStationAction(stationId: string, raw: unknown) {
  try {
    const ctx = await requireAdminCtx();
    const input = stationSchema.partial().parse(raw);
    await updateStation(stationId, DEMO_TENANT_ID, input, ctx.userId);
    return { ok: true as const };
  } catch (err) { return { ok: false as const, error: String(err) }; }
}

export async function setStationStatusAction(stationId: string, status: 'available' | 'maintenance' | 'cleaning') {
  try {
    const ctx = await requireAdminCtx();
    await setStationStatus(stationId, DEMO_TENANT_ID, status, ctx.userId);
    return { ok: true as const };
  } catch (err) { return { ok: false as const, error: String(err) }; }
}

export async function deleteStationAction(stationId: string) {
  try {
    const ctx = await requireAdminCtx();
    const result = await deleteStation(stationId, DEMO_TENANT_ID, ctx.userId);
    return { ok: true as const, archived: result.archived };
  } catch (err) { return { ok: false as const, error: String(err) }; }
}

export async function updateStationPositionsAction(positions: Array<{ stationId: string; x: number; y: number }>) {
  try {
    const ctx = await requireAdminCtx();
    await updateStationPositions(DEMO_TENANT_ID, DEMO_BRANCH_ID, positions, ctx.userId);
    return { ok: true as const };
  } catch (err) { return { ok: false as const, error: String(err) }; }
}
