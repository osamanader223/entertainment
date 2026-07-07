import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';

export interface VenueSettings {
  tenant: {
    displayName: string;
    brandPrimaryColor: string | null;
    brandAccentColor: string | null;
    logoUrl: string | null;
    timezone: string;
    currency: string;
  };
  branch: {
    displayName: string;
    addressLine: string | null;
    city: string | null;
    phone: string | null;
    whatsappNumber: string | null;
    opensAt: string;
    closesAt: string;
    queuePolicy: {
      notification_window_minutes: number;
      max_wait_minutes: number;
      cancellation_credit_percent: number;
      allow_anonymous_queue: boolean;
    };
  };
}

const DEFAULT_QUEUE_POLICY = {
  notification_window_minutes: 10,
  max_wait_minutes: 90,
  cancellation_credit_percent: 100,
  allow_anonymous_queue: false,
};

export async function getVenueSettings(tenantId: string, branchId: string): Promise<VenueSettings> {
  const admin = createAdminClient();

  const [{ data: tenantRaw, error: tenantErr }, { data: branchRaw, error: branchErr }] = await Promise.all([
    admin
      .from('tenants')
      .select('display_name, brand_primary_color, brand_accent_color, logo_url, timezone, currency')
      .eq('id', tenantId)
      .single(),
    admin
      .from('branches')
      .select('display_name, address_line, city, phone, whatsapp_number, opens_at, closes_at, queue_policy')
      .eq('id', branchId)
      .single(),
  ]);
  if (tenantErr) throw tenantErr;
  if (branchErr) throw branchErr;

  const tenant = tenantRaw as unknown as {
    display_name: string; brand_primary_color: string | null; brand_accent_color: string | null;
    logo_url: string | null; timezone: string; currency: string;
  };
  const branch = branchRaw as unknown as {
    display_name: string; address_line: string | null; city: string | null; phone: string | null;
    whatsapp_number: string | null; opens_at: string; closes_at: string; queue_policy: Record<string, unknown>;
  };

  return {
    tenant: {
      displayName: tenant.display_name,
      brandPrimaryColor: tenant.brand_primary_color,
      brandAccentColor: tenant.brand_accent_color,
      logoUrl: tenant.logo_url,
      timezone: tenant.timezone,
      currency: tenant.currency,
    },
    branch: {
      displayName: branch.display_name,
      addressLine: branch.address_line,
      city: branch.city,
      phone: branch.phone,
      whatsappNumber: branch.whatsapp_number,
      opensAt: branch.opens_at,
      closesAt: branch.closes_at,
      queuePolicy: {
        ...DEFAULT_QUEUE_POLICY,
        ...(branch.queue_policy as Partial<typeof DEFAULT_QUEUE_POLICY>),
      },
    },
  };
}

export interface UpdateTenantSettingsInput {
  displayName?: string;
  brandPrimaryColor?: string;
  brandAccentColor?: string;
  logoUrl?: string | null;
}

/** Only tenant_admin / super_admin may update tenant branding — enforced via `isTenantAdminOrSuper`. */
export async function updateTenantSettings(
  tenantId: string,
  patch: UpdateTenantSettingsInput,
  actorId: string,
  isTenantAdminOrSuper: boolean,
): Promise<void> {
  if (!isTenantAdminOrSuper) throw new Error('forbidden');

  const admin = createAdminClient();
  const update: Record<string, unknown> = {};
  if (patch.displayName !== undefined) update.display_name = patch.displayName;
  if (patch.brandPrimaryColor !== undefined) update.brand_primary_color = patch.brandPrimaryColor;
  if (patch.brandAccentColor !== undefined) update.brand_accent_color = patch.brandAccentColor;
  if (patch.logoUrl !== undefined) update.logo_url = patch.logoUrl;

  const { error } = await admin.from('tenants').update(update as never).eq('id', tenantId);
  if (error) throw error;

  await admin.from('activity_log').insert({
    tenant_id: tenantId,
    actor_id: actorId,
    actor_role: 'tenant_admin' as never,
    action: 'settings.tenant_updated',
    entity_type: 'tenant',
    entity_id: tenantId,
    after: update as never,
  });
}

export interface UpdateBranchSettingsInput {
  displayName?: string;
  addressLine?: string | null;
  city?: string | null;
  phone?: string | null;
  whatsappNumber?: string | null;
  opensAt?: string;
  closesAt?: string;
  queuePolicy?: Partial<{
    notification_window_minutes: number;
    max_wait_minutes: number;
    cancellation_credit_percent: number;
    allow_anonymous_queue: boolean;
  }>;
}

export async function updateBranchSettings(
  tenantId: string,
  branchId: string,
  patch: UpdateBranchSettingsInput,
  actorId: string,
): Promise<void> {
  const admin = createAdminClient();
  const update: Record<string, unknown> = {};
  if (patch.displayName !== undefined) update.display_name = patch.displayName;
  if (patch.addressLine !== undefined) update.address_line = patch.addressLine;
  if (patch.city !== undefined) update.city = patch.city;
  if (patch.phone !== undefined) update.phone = patch.phone;
  if (patch.whatsappNumber !== undefined) update.whatsapp_number = patch.whatsappNumber;
  if (patch.opensAt !== undefined) update.opens_at = patch.opensAt;
  if (patch.closesAt !== undefined) update.closes_at = patch.closesAt;

  if (patch.queuePolicy !== undefined) {
    const { data: currentRaw } = await admin.from('branches').select('queue_policy').eq('id', branchId).single();
    const current = (currentRaw as unknown as { queue_policy: Record<string, unknown> } | null)?.queue_policy ?? {};
    update.queue_policy = { ...DEFAULT_QUEUE_POLICY, ...current, ...patch.queuePolicy };
  }

  const { error } = await admin.from('branches').update(update as never).eq('id', branchId).eq('tenant_id', tenantId);
  if (error) throw error;

  await admin.from('activity_log').insert({
    tenant_id: tenantId,
    branch_id: branchId,
    actor_id: actorId,
    actor_role: 'manager' as never,
    action: 'settings.branch_updated',
    entity_type: 'branch',
    entity_id: branchId,
    after: update as never,
  });
}
