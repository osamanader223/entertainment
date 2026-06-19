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
