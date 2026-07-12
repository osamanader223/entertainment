import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendTemplateMessage } from '@/lib/whatsapp';

export type TemplateCode =
  | 'queue_you_are_next'
  | 'queue_almost_your_turn'
  | 'booking_confirmed'
  | 'session_ending_soon'
  | 'session_ended_points'
  | 'booking_reminder';

/**
 * Template configuration: maps named params to positional order (Meta fills
 * {{1}}, {{2}}, ... in this order) and declares the message category.
 * These names must be submitted to Meta for template approval exactly as
 * written here, with body variables in this exact order.
 */
const TEMPLATE_CONFIG: Record<TemplateCode, { paramOrder: string[]; category: 'utility' }> = {
  queue_you_are_next: { paramOrder: ['name', 'ticketNumber', 'windowMinutes'], category: 'utility' },
  queue_almost_your_turn: { paramOrder: ['name', 'peopleAhead', 'gameName'], category: 'utility' },
  booking_confirmed: { paramOrder: ['stationName', 'startTime', 'durationMinutes', 'referenceCode'], category: 'utility' },
  session_ending_soon: { paramOrder: ['name', 'minutesLeft'], category: 'utility' },
  session_ended_points: { paramOrder: ['name', 'pointsEarned', 'pointsBalance'], category: 'utility' },
  booking_reminder: { paramOrder: ['name', 'stationName', 'startTime'], category: 'utility' },
};

export interface SendNotificationInput {
  tenantId: string;
  customerId: string;
  templateCode: TemplateCode;
  params: Record<string, string>;
  referenceType: string;
  referenceId: string;
  category?: 'utility' | 'service';
}

export interface SendNotificationResult {
  sent: boolean;
  reason?: string;
  notificationId?: string;
}

/**
 * The single entry point every feature calls to send a transactional
 * WhatsApp message. Idempotent (per template+reference+customer), resilient
 * (never throws), and consent-aware (respects an explicit opt-out — utility
 * messages don't require marketing consent).
 */
export async function sendNotification(input: SendNotificationInput): Promise<SendNotificationResult> {
  const admin = createAdminClient();

  try {
    // 1. Idempotency: has this exact (template, reference) already gone out to this customer?
    const { data: existingRaw } = await admin
      .from('notifications')
      .select('id, status, retries')
      .eq('tenant_id', input.tenantId)
      .eq('customer_id', input.customerId)
      .eq('template_code', input.templateCode)
      .eq('reference_type', input.referenceType)
      .eq('reference_id', input.referenceId)
      .maybeSingle();
    const existing = existingRaw as unknown as { id: string; status: string; retries: number } | null;

    if (existing && existing.status !== 'failed') {
      return { sent: false, reason: 'already_sent', notificationId: existing.id };
    }

    // 2. Load the customer
    const { data: profileRaw } = await admin
      .from('profiles')
      .select('phone, preferred_locale, whatsapp_opted_out, whatsapp_window_expires_at')
      .eq('id', input.customerId)
      .maybeSingle();
    const profile = profileRaw as unknown as {
      phone: string | null;
      preferred_locale: string | null;
      whatsapp_opted_out: boolean;
      whatsapp_window_expires_at: string | null;
    } | null;

    if (!profile) return { sent: false, reason: 'customer_not_found' };

    // 3. Guards
    if (!profile.phone) return { sent: false, reason: 'no_phone' };
    if (profile.whatsapp_opted_out) return { sent: false, reason: 'opted_out' };

    const wasFree = !!profile.whatsapp_window_expires_at && new Date(profile.whatsapp_window_expires_at) > new Date();
    const languageCode = profile.preferred_locale === 'en' ? 'en' : 'ar';
    const config = TEMPLATE_CONFIG[input.templateCode];
    const bodyParams = config.paramOrder.map((key) => input.params[key] ?? '');

    // 4. Write the notifications row BEFORE calling the API — always have an audit trail,
    //    even if the process crashes mid-send. Reuse a prior 'failed' row on retry.
    let notificationId: string;
    if (existing) {
      notificationId = existing.id;
      await admin
        .from('notifications')
        .update({ status: 'queued', payload: input.params, error: null } as never)
        .eq('id', notificationId);
    } else {
      const { data: inserted, error: insertError } = await admin
        .from('notifications')
        .insert({
          tenant_id: input.tenantId,
          customer_id: input.customerId,
          channel: 'whatsapp',
          template_code: input.templateCode,
          payload: input.params,
          status: 'queued',
          reference_type: input.referenceType,
          reference_id: input.referenceId,
          category: input.category ?? config.category,
          was_free: wasFree,
        } as never)
        .select('id')
        .single();

      if (insertError || !inserted) {
        // Most likely a race on the idempotency unique index — treat as already-sent.
        console.warn('[notifications] insert failed (likely a duplicate-send race)', insertError);
        return { sent: false, reason: 'insert_failed' };
      }
      notificationId = (inserted as unknown as { id: string }).id;
    }

    // 5/6/7. Send the template (always the template, even inside the free window — it's free there too)
    const result = await sendTemplateMessage({
      toPhone: profile.phone,
      templateName: input.templateCode,
      languageCode,
      bodyParams,
    });

    if ('error' in result) {
      await admin
        .from('notifications')
        .update({ status: 'failed', error: result.error, retries: (existing?.retries ?? 0) + 1 } as never)
        .eq('id', notificationId);

      await admin.from('activity_log').insert({
        tenant_id: input.tenantId,
        actor_id: null,
        action: 'notification.failed',
        entity_type: 'notification',
        entity_id: notificationId,
        after: { template_code: input.templateCode, customer_id: input.customerId, was_free: wasFree, error: result.error } as never,
      });

      return { sent: false, reason: result.error, notificationId };
    }

    await admin
      .from('notifications')
      .update({ status: 'sent', sent_at: new Date().toISOString(), provider_message_id: result.messageId } as never)
      .eq('id', notificationId);

    await admin.from('activity_log').insert({
      tenant_id: input.tenantId,
      actor_id: null,
      action: 'notification.sent',
      entity_type: 'notification',
      entity_id: notificationId,
      after: { template_code: input.templateCode, customer_id: input.customerId, was_free: wasFree } as never,
    });

    return { sent: true, notificationId };
  } catch (err) {
    // Never throw — a notification failure must never break the caller's core flow.
    console.error('[notifications] sendNotification threw', err);
    return { sent: false, reason: 'internal_error' };
  }
}

/**
 * Fire-and-forget wrapper — callers use this, never `sendNotification`
 * directly, so a WhatsApp failure can never block or break a booking, queue
 * call, or session end.
 */
export function fireNotification(input: SendNotificationInput): void {
  void sendNotification(input).catch((err) => console.error('[notification] failed silently', err));
}

export interface NotificationLogRow {
  id: string;
  customerName: string | null;
  customerPhone: string | null;
  templateCode: string | null;
  status: string;
  wasFree: boolean;
  sentAt: string | null;
  error: string | null;
  createdAt: string;
}

/** Read-only notifications log for the admin messages page. */
export async function listNotifications(input: {
  tenantId: string;
  statusFilter?: string;
  templateFilter?: string;
  limit?: number;
}): Promise<NotificationLogRow[]> {
  const admin = createAdminClient();

  let query = admin
    .from('notifications')
    .select('id, customer_id, template_code, status, was_free, sent_at, error, created_at')
    .eq('tenant_id', input.tenantId)
    .order('created_at', { ascending: false })
    .limit(input.limit ?? 50);

  if (input.statusFilter) query = query.eq('status', input.statusFilter as never);
  if (input.templateFilter) query = query.eq('template_code', input.templateFilter);

  const { data, error } = await query;
  if (error) throw error;

  const rows = (data ?? []) as unknown as Array<{
    id: string; customer_id: string | null; template_code: string | null; status: string;
    was_free: boolean; sent_at: string | null; error: string | null; created_at: string;
  }>;

  const customerIds = [...new Set(rows.map((r) => r.customer_id).filter((id): id is string => !!id))];
  const { data: profilesRaw } = customerIds.length
    ? await admin.from('profiles').select('id, full_name, phone').in('id', customerIds)
    : { data: [] };
  const profileMap = new Map(
    ((profilesRaw ?? []) as unknown as Array<{ id: string; full_name: string | null; phone: string | null }>)
      .map((p) => [p.id, p]),
  );

  return rows.map((r) => ({
    id: r.id,
    customerName: r.customer_id ? (profileMap.get(r.customer_id)?.full_name ?? null) : null,
    customerPhone: r.customer_id ? (profileMap.get(r.customer_id)?.phone ?? null) : null,
    templateCode: r.template_code,
    status: r.status,
    wasFree: r.was_free,
    sentAt: r.sent_at,
    error: r.error,
    createdAt: r.created_at,
  }));
}

export interface NotificationMonthStats {
  totalSent: number;
  delivered: number;
  failed: number;
  free: number;
  paid: number;
}

/** Sent/delivered/failed + free-vs-paid counts for the current calendar month. */
export async function getNotificationMonthStats(tenantId: string): Promise<NotificationMonthStats> {
  const admin = createAdminClient();
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const { data, error } = await admin
    .from('notifications')
    .select('status, was_free')
    .eq('tenant_id', tenantId)
    .gte('created_at', startOfMonth.toISOString());
  if (error) throw error;

  const rows = (data ?? []) as unknown as Array<{ status: string; was_free: boolean }>;
  const sentLike = (s: string) => s === 'sent' || s === 'delivered' || s === 'read';

  return {
    totalSent: rows.filter((r) => sentLike(r.status)).length,
    delivered: rows.filter((r) => r.status === 'delivered' || r.status === 'read').length,
    failed: rows.filter((r) => r.status === 'failed').length,
    free: rows.filter((r) => r.was_free).length,
    paid: rows.filter((r) => !r.was_free).length,
  };
}
