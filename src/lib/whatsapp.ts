import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';

const DEFAULT_API_VERSION = 'v21.0';

function apiBase(): string {
  return `https://graph.facebook.com/${process.env.WHATSAPP_API_VERSION ?? DEFAULT_API_VERSION}`;
}

let warnedMissingEnv = false;

function getCredentials(): { phoneNumberId: string; accessToken: string } | null {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!phoneNumberId || !accessToken) {
    if (!warnedMissingEnv) {
      console.warn('[whatsapp] WHATSAPP_PHONE_NUMBER_ID / WHATSAPP_ACCESS_TOKEN not configured — messages will not be sent.');
      warnedMissingEnv = true;
    }
    return null;
  }
  return { phoneNumberId, accessToken };
}

/** Meta wants the `to` field as digits only (no leading '+'). */
function normalizeToDigits(phone: string): string {
  return phone.replace(/\D/g, '');
}

interface WhatsAppApiResponse {
  messages?: Array<{ id: string }>;
  error?: { message?: string };
}

async function postMessage(body: Record<string, unknown>): Promise<{ messageId: string } | { error: string }> {
  const creds = getCredentials();
  if (!creds) return { error: 'whatsapp_not_configured' };

  try {
    const res = await fetch(`${apiBase()}/${creds.phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${creds.accessToken}`,
      },
      body: JSON.stringify({ messaging_product: 'whatsapp', ...body }),
    });

    const json = (await res.json().catch(() => null)) as WhatsAppApiResponse | null;

    if (!res.ok) {
      const message = json?.error?.message ?? `whatsapp_api_error_${res.status}`;
      console.error('[whatsapp] send failed', message);
      return { error: message };
    }

    const messageId = json?.messages?.[0]?.id;
    if (!messageId) {
      console.error('[whatsapp] send: no message id in response', json);
      return { error: 'no_message_id' };
    }
    return { messageId };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown_error';
    console.error('[whatsapp] send threw', message);
    return { error: message };
  }
}

/** Send an approved TEMPLATE message — works outside the 24h service window. */
export async function sendTemplateMessage(input: {
  toPhone: string;
  templateName: string;
  languageCode: string;
  bodyParams: string[];
  buttonPayload?: string;
}): Promise<{ messageId: string } | { error: string }> {
  const components: Array<Record<string, unknown>> = [
    {
      type: 'body',
      parameters: input.bodyParams.map((text) => ({ type: 'text', text })),
    },
  ];

  if (input.buttonPayload) {
    components.push({
      type: 'button',
      sub_type: 'quick_reply',
      index: '0',
      parameters: [{ type: 'payload', payload: input.buttonPayload }],
    });
  }

  return postMessage({
    to: normalizeToDigits(input.toPhone),
    type: 'template',
    template: {
      name: input.templateName,
      language: { code: input.languageCode },
      components,
    },
  });
}

/** Send a FREE-FORM text message — ONLY valid inside the 24h service window. */
export async function sendFreeformMessage(input: {
  toPhone: string;
  text: string;
}): Promise<{ messageId: string } | { error: string }> {
  return postMessage({
    to: normalizeToDigits(input.toPhone),
    type: 'text',
    text: { body: input.text },
  });
}

/** Whether a customer is currently inside their free 24h WhatsApp service window. */
export async function isInServiceWindow(customerId: string): Promise<boolean> {
  const admin = createAdminClient();
  const { data } = await admin
    .from('profiles')
    .select('whatsapp_window_expires_at')
    .eq('id', customerId)
    .maybeSingle();

  if (!data?.whatsapp_window_expires_at) return false;
  return new Date(data.whatsapp_window_expires_at) > new Date();
}
