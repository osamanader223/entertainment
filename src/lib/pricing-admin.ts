import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';

export interface PricingRuleRow {
  id: string;
  tenant_id: string;
  branch_id: string | null;
  game_type_id: string;
  game_type_name_en: string;
  game_type_name_ar: string;
  name: string;
  unit: 'per_minute' | 'per_hour' | 'per_session' | 'per_player_hour';
  amount_cents: number;
  starts_at_time: string | null;
  ends_at_time: string | null;
  days_of_week: number[] | null;
  valid_from: string | null;
  valid_to: string | null;
  priority: number;
  is_active: boolean;
  created_at: string;
}

export async function listPricingRules(tenantId: string): Promise<PricingRuleRow[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('pricing_rules')
    .select('*, game_types(display_name_en, display_name_ar)')
    .eq('tenant_id', tenantId)
    .order('priority', { ascending: false });

  if (error) throw error;

  return ((data ?? []) as unknown as Array<{
    id: string; tenant_id: string; branch_id: string | null;
    game_type_id: string; name: string;
    unit: 'per_minute' | 'per_hour' | 'per_session' | 'per_player_hour';
    amount_cents: number; starts_at_time: string | null; ends_at_time: string | null;
    days_of_week: number[] | null; valid_from: string | null; valid_to: string | null;
    priority: number; is_active: boolean; created_at: string;
    game_types: { display_name_en: string; display_name_ar: string } | null;
  }>).map((r) => ({
    ...r,
    game_type_name_en: r.game_types?.display_name_en ?? '',
    game_type_name_ar: r.game_types?.display_name_ar ?? '',
  }));
}

export interface CreatePricingRuleInput {
  tenantId: string;
  branchId?: string | null;
  gameTypeId: string;
  name: string;
  unit: 'per_minute' | 'per_hour' | 'per_session' | 'per_player_hour';
  amountCents: number;
  startsAtTime?: string | null;
  endsAtTime?: string | null;
  daysOfWeek?: number[] | null;
  validFrom?: string | null;
  validTo?: string | null;
  priority: number;
  isActive: boolean;
  actorId: string;
}

export async function createPricingRule(input: CreatePricingRuleInput): Promise<{ ruleId: string }> {
  const admin = createAdminClient();

  const { data, error } = await admin
    .from('pricing_rules')
    .insert({
      tenant_id: input.tenantId,
      branch_id: input.branchId ?? null,
      game_type_id: input.gameTypeId,
      name: input.name,
      unit: input.unit,
      amount_cents: input.amountCents,
      starts_at_time: input.startsAtTime ?? null,
      ends_at_time: input.endsAtTime ?? null,
      days_of_week: input.daysOfWeek ?? null,
      valid_from: input.validFrom ?? null,
      valid_to: input.validTo ?? null,
      priority: input.priority,
      is_active: input.isActive,
    })
    .select('id')
    .single();

  if (error) throw error;
  const ruleId = (data as unknown as { id: string }).id;

  await admin.from('activity_log').insert({
    tenant_id: input.tenantId,
    actor_id: input.actorId,
    actor_role: 'manager' as never,
    action: 'pricing.created',
    entity_type: 'pricing_rule',
    entity_id: ruleId,
    after: { name: input.name, unit: input.unit, amount_cents: input.amountCents } as never,
  });

  return { ruleId };
}

export type UpdatePricingRuleInput = Partial<Omit<CreatePricingRuleInput, 'tenantId' | 'actorId'>>;

export async function updatePricingRule(
  ruleId: string,
  tenantId: string,
  patch: UpdatePricingRuleInput,
  actorId: string,
): Promise<void> {
  const admin = createAdminClient();

  const update: Record<string, unknown> = {};
  if (patch.gameTypeId !== undefined) update.game_type_id = patch.gameTypeId;
  if (patch.branchId !== undefined) update.branch_id = patch.branchId;
  if (patch.name !== undefined) update.name = patch.name;
  if (patch.unit !== undefined) update.unit = patch.unit;
  if (patch.amountCents !== undefined) update.amount_cents = patch.amountCents;
  if (patch.startsAtTime !== undefined) update.starts_at_time = patch.startsAtTime;
  if (patch.endsAtTime !== undefined) update.ends_at_time = patch.endsAtTime;
  if (patch.daysOfWeek !== undefined) update.days_of_week = patch.daysOfWeek;
  if (patch.validFrom !== undefined) update.valid_from = patch.validFrom;
  if (patch.validTo !== undefined) update.valid_to = patch.validTo;
  if (patch.priority !== undefined) update.priority = patch.priority;
  if (patch.isActive !== undefined) update.is_active = patch.isActive;

  const { error } = await admin
    .from('pricing_rules')
    .update(update as never)
    .eq('id', ruleId)
    .eq('tenant_id', tenantId);

  if (error) throw error;

  await admin.from('activity_log').insert({
    tenant_id: tenantId,
    actor_id: actorId,
    actor_role: 'manager' as never,
    action: 'pricing.updated',
    entity_type: 'pricing_rule',
    entity_id: ruleId,
    after: update as never,
  });
}

export async function setPricingRuleActive(
  ruleId: string,
  tenantId: string,
  isActive: boolean,
  actorId: string,
): Promise<void> {
  const admin = createAdminClient();

  const { error } = await admin
    .from('pricing_rules')
    .update({ is_active: isActive })
    .eq('id', ruleId)
    .eq('tenant_id', tenantId);

  if (error) throw error;

  await admin.from('activity_log').insert({
    tenant_id: tenantId,
    actor_id: actorId,
    actor_role: 'manager' as never,
    action: isActive ? 'pricing.activated' : 'pricing.deactivated',
    entity_type: 'pricing_rule',
    entity_id: ruleId,
    after: { is_active: isActive } as never,
  });
}

export async function deletePricingRule(
  ruleId: string,
  tenantId: string,
  actorId: string,
): Promise<void> {
  const admin = createAdminClient();

  await admin.from('activity_log').insert({
    tenant_id: tenantId,
    actor_id: actorId,
    actor_role: 'manager' as never,
    action: 'pricing.deleted',
    entity_type: 'pricing_rule',
    entity_id: ruleId,
    after: null,
  });

  const { error } = await admin
    .from('pricing_rules')
    .delete()
    .eq('id', ruleId)
    .eq('tenant_id', tenantId);

  if (error) throw error;
}

// =====================================================================
// GAME DURATION PARAMS — bowling's (and any future player/game-count-based
// game type's) duration formula coefficients. See lib/bowling.ts for the
// formula itself.
// =====================================================================

export interface GameDurationParamsRow {
  id: string;
  tenantId: string;
  gameTypeId: string;
  gameTypeNameEn: string;
  gameTypeNameAr: string;
  baseMinutes: number;
  minutesPerPlayerPerGame: number;
  minMinutes: number;
  maxMinutes: number;
}

/** Every game type that has (or could have) duration-formula coefficients — join in the row if it exists, or defaults if not. */
export async function listGameDurationParams(tenantId: string): Promise<GameDurationParamsRow[]> {
  const admin = createAdminClient();

  const [{ data: gameTypesRaw, error: gtError }, { data: paramsRaw, error: paramsError }] = await Promise.all([
    admin
      .from('game_types')
      .select('id, display_name_en, display_name_ar, code')
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .order('sort_order'),
    admin
      .from('game_duration_params')
      .select('id, game_type_id, base_minutes, minutes_per_player_per_game, min_minutes, max_minutes')
      .eq('tenant_id', tenantId),
  ]);
  if (gtError) throw gtError;
  if (paramsError) throw paramsError;

  const paramsByGameType = new Map((paramsRaw ?? []).map((p) => [p.game_type_id, p]));

  // Only game types that already have a coefficients row, or whose code
  // looks bowling-like — no point cluttering the editor with every game type.
  return (gameTypesRaw ?? [])
    .filter((gt) => paramsByGameType.has(gt.id) || gt.code.toLowerCase().includes('bowl'))
    .map((gt) => {
      const p = paramsByGameType.get(gt.id);
      return {
        id: p?.id ?? '',
        tenantId,
        gameTypeId: gt.id,
        gameTypeNameEn: gt.display_name_en,
        gameTypeNameAr: gt.display_name_ar,
        baseMinutes: p?.base_minutes ?? 10,
        minutesPerPlayerPerGame: p ? Number(p.minutes_per_player_per_game) : 9,
        minMinutes: p?.min_minutes ?? 20,
        maxMinutes: p?.max_minutes ?? 180,
      };
    });
}

export interface UpsertGameDurationParamsInput {
  tenantId: string;
  gameTypeId: string;
  baseMinutes: number;
  minutesPerPlayerPerGame: number;
  minMinutes: number;
  maxMinutes: number;
  actorId: string;
}

export async function upsertGameDurationParams(input: UpsertGameDurationParamsInput): Promise<void> {
  const admin = createAdminClient();

  const { error } = await admin
    .from('game_duration_params')
    .upsert(
      {
        tenant_id: input.tenantId,
        game_type_id: input.gameTypeId,
        base_minutes: input.baseMinutes,
        minutes_per_player_per_game: input.minutesPerPlayerPerGame,
        min_minutes: input.minMinutes,
        max_minutes: input.maxMinutes,
      },
      { onConflict: 'tenant_id,game_type_id' },
    );
  if (error) throw error;

  await admin.from('activity_log').insert({
    tenant_id: input.tenantId,
    actor_id: input.actorId,
    actor_role: 'manager' as never,
    action: 'game_duration_params.updated',
    entity_type: 'game_duration_params',
    entity_id: input.gameTypeId,
    after: {
      base_minutes: input.baseMinutes,
      minutes_per_player_per_game: input.minutesPerPlayerPerGame,
      min_minutes: input.minMinutes,
      max_minutes: input.maxMinutes,
    } as never,
  });
}
