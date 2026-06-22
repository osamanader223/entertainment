import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';

export interface StationAdmin {
  id: string;
  code: string;
  displayName: string;
  gameTypeId: string;
  gameTypeName: string;
  gameTypeNameAr: string;
  status: string;
  isActive: boolean;
  positionX: number | null;
  positionY: number | null;
  iftttEventOn: string | null;
  iftttEventOff: string | null;
  iftttEventAlert: string | null;
  notes: string | null;
}

export async function listStations(tenantId: string, branchId: string): Promise<StationAdmin[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('stations')
    .select('id, code, display_name, game_type_id, status, is_active, position_x, position_y, ifttt_event_on, ifttt_event_off, ifttt_event_alert, notes')
    .eq('tenant_id', tenantId)
    .eq('branch_id', branchId)
    .order('code', { ascending: true });

  if (error) throw error;
  if (!data || data.length === 0) return [];

  const rows = data as unknown as Array<{
    id: string; code: string; display_name: string; game_type_id: string;
    status: string; is_active: boolean; position_x: number | null; position_y: number | null;
    ifttt_event_on: string | null; ifttt_event_off: string | null; ifttt_event_alert: string | null;
    notes: string | null;
  }>;

  const gtIds = [...new Set(rows.map((r) => r.game_type_id))];
  const { data: gts } = await admin.from('game_types').select('id, display_name_en, display_name_ar').in('id', gtIds);
  const gtMap = new Map(
    ((gts ?? []) as unknown as Array<{ id: string; display_name_en: string; display_name_ar: string }>)
      .map((g) => [g.id, g]),
  );

  return rows.map((r) => ({
    id: r.id,
    code: r.code,
    displayName: r.display_name,
    gameTypeId: r.game_type_id,
    gameTypeName: gtMap.get(r.game_type_id)?.display_name_en ?? '',
    gameTypeNameAr: gtMap.get(r.game_type_id)?.display_name_ar ?? '',
    status: r.status,
    isActive: r.is_active,
    positionX: r.position_x,
    positionY: r.position_y,
    iftttEventOn: r.ifttt_event_on,
    iftttEventOff: r.ifttt_event_off,
    iftttEventAlert: r.ifttt_event_alert,
    notes: r.notes,
  }));
}

export interface CreateStationInput {
  tenantId: string; branchId: string; gameTypeId: string;
  code: string; displayName: string;
  iftttEventOn?: string | null; iftttEventOff?: string | null; iftttEventAlert?: string | null;
  positionX?: number | null; positionY?: number | null; notes?: string | null;
  isActive: boolean; actorId: string;
}

export async function createStation(input: CreateStationInput): Promise<{ stationId: string }> {
  const admin = createAdminClient();
  const { data, error } = await admin.from('stations').insert({
    tenant_id: input.tenantId,
    branch_id: input.branchId,
    game_type_id: input.gameTypeId,
    code: input.code.toUpperCase().trim(),
    display_name: input.displayName.trim(),
    status: 'available',
    ifttt_event_on: input.iftttEventOn ?? null,
    ifttt_event_off: input.iftttEventOff ?? null,
    ifttt_event_alert: input.iftttEventAlert ?? null,
    position_x: input.positionX ?? null,
    position_y: input.positionY ?? null,
    notes: input.notes ?? null,
    is_active: input.isActive,
  }).select('id').single();

  if (error) throw error;
  const stationId = (data as unknown as { id: string }).id;

  await admin.from('activity_log').insert({
    tenant_id: input.tenantId,
    actor_id: input.actorId,
    actor_role: 'manager' as never,
    action: 'station.created',
    entity_type: 'station',
    entity_id: stationId,
    after: { code: input.code, display_name: input.displayName } as never,
  });

  return { stationId };
}

export type UpdateStationInput = Partial<Omit<CreateStationInput, 'tenantId' | 'actorId' | 'branchId'>>;

export async function updateStation(
  stationId: string, tenantId: string, patch: UpdateStationInput, actorId: string,
): Promise<void> {
  const admin = createAdminClient();
  const update: Record<string, unknown> = {};
  if (patch.gameTypeId !== undefined) update.game_type_id = patch.gameTypeId;
  if (patch.code !== undefined) update.code = patch.code.toUpperCase().trim();
  if (patch.displayName !== undefined) update.display_name = patch.displayName.trim();
  if (patch.iftttEventOn !== undefined) update.ifttt_event_on = patch.iftttEventOn;
  if (patch.iftttEventOff !== undefined) update.ifttt_event_off = patch.iftttEventOff;
  if (patch.iftttEventAlert !== undefined) update.ifttt_event_alert = patch.iftttEventAlert;
  if (patch.positionX !== undefined) update.position_x = patch.positionX;
  if (patch.positionY !== undefined) update.position_y = patch.positionY;
  if (patch.notes !== undefined) update.notes = patch.notes;
  if (patch.isActive !== undefined) update.is_active = patch.isActive;

  const { error } = await admin.from('stations').update(update as never).eq('id', stationId).eq('tenant_id', tenantId);
  if (error) throw error;

  await admin.from('activity_log').insert({
    tenant_id: tenantId,
    actor_id: actorId,
    actor_role: 'manager' as never,
    action: 'station.updated',
    entity_type: 'station',
    entity_id: stationId,
    after: update as never,
  });
}

type ManualStatus = 'available' | 'maintenance' | 'cleaning';

export async function setStationStatus(
  stationId: string, tenantId: string, status: ManualStatus, actorId: string,
): Promise<void> {
  const admin = createAdminClient();

  if (status === 'maintenance' || status === 'cleaning') {
    const { data: activeSessions } = await admin
      .from('sessions')
      .select('id')
      .eq('station_id', stationId)
      .in('status', ['active', 'paused'])
      .limit(1);

    if (activeSessions && activeSessions.length > 0) {
      throw new Error('station_in_use');
    }
  }

  const { error } = await admin.from('stations').update({ status }).eq('id', stationId).eq('tenant_id', tenantId);
  if (error) throw error;

  await admin.from('activity_log').insert({
    tenant_id: tenantId,
    actor_id: actorId,
    actor_role: 'manager' as never,
    action: 'station.status_changed',
    entity_type: 'station',
    entity_id: stationId,
    after: { status } as never,
  });
}

export async function deleteStation(stationId: string, tenantId: string, actorId: string): Promise<{ archived: boolean }> {
  const admin = createAdminClient();

  // Check for active sessions first
  const { data: activeSessions } = await admin
    .from('sessions')
    .select('id')
    .eq('station_id', stationId)
    .in('status', ['active', 'paused'])
    .limit(1);

  if (activeSessions && activeSessions.length > 0) {
    throw new Error('station_in_use');
  }

  // Check for any historical sessions (soft-delete to preserve history)
  const { count: historyCount } = await admin
    .from('sessions')
    .select('id', { count: 'exact', head: true })
    .eq('station_id', stationId);

  if ((historyCount ?? 0) > 0) {
    await admin.from('stations').update({ is_active: false }).eq('id', stationId).eq('tenant_id', tenantId);
    await admin.from('activity_log').insert({
      tenant_id: tenantId, actor_id: actorId, actor_role: 'manager' as never,
      action: 'station.archived', entity_type: 'station', entity_id: stationId, after: null,
    });
    return { archived: true };
  }

  await admin.from('stations').delete().eq('id', stationId).eq('tenant_id', tenantId);
  await admin.from('activity_log').insert({
    tenant_id: tenantId, actor_id: actorId, actor_role: 'manager' as never,
    action: 'station.deleted', entity_type: 'station', entity_id: stationId, after: null,
  });
  return { archived: false };
}

export async function updateStationPositions(
  tenantId: string, _branchId: string,
  positions: Array<{ stationId: string; x: number; y: number }>,
  actorId: string,
): Promise<void> {
  const admin = createAdminClient();

  await Promise.all(
    positions.map((pos) =>
      admin.from('stations')
        .update({ position_x: pos.x, position_y: pos.y })
        .eq('id', pos.stationId)
        .eq('tenant_id', tenantId),
    ),
  );

  await admin.from('activity_log').insert({
    tenant_id: tenantId,
    actor_id: actorId,
    actor_role: 'manager' as never,
    action: 'station.positions_updated',
    entity_type: 'station',
    entity_id: null,
    after: { count: positions.length } as never,
  });
}
