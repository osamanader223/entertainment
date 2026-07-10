import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendFreeformMessage } from '@/lib/whatsapp';

export const runtime = 'nodejs';

const DEMO_TENANT_ID = '11111111-1111-1111-1111-111111111111';

const STOP_KEYWORDS = ['stop', 'unsubscribe', 'إيقاف', 'الغاء الاشتراك', 'إلغاء الاشتراك'];

type AdminClient = ReturnType<typeof createAdminClient>;

// GET /api/webhooks/whatsapp — Meta's verification handshake.
// Register this URL + your WHATSAPP_VERIFY_TOKEN in the Meta dashboard.
export async function GET(req: NextRequest) {
  const mode = req.nextUrl.searchParams.get('hub.mode');
  const token = req.nextUrl.searchParams.get('hub.verify_token');
  const challenge = req.nextUrl.searchParams.get('hub.challenge');

  if (mode === 'subscribe' && challenge && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return new NextResponse(challenge, { status: 200 });
  }
  return new NextResponse('Forbidden', { status: 403 });
}

interface InboundMessage {
  from: string; // digits, no '+'
  id: string;
  type: string;
  text?: { body: string };
  button?: { payload: string; text: string };
}

interface StatusUpdate {
  id: string; // provider_message_id
  status: string; // 'sent' | 'delivered' | 'read' | 'failed'
  timestamp: string; // unix seconds, as a string
}

interface WhatsAppWebhookPayload {
  entry?: Array<{
    changes?: Array<{
      value?: {
        messages?: InboundMessage[];
        statuses?: StatusUpdate[];
      };
    }>;
  }>;
}

// POST /api/webhooks/whatsapp — inbound messages + delivery status updates.
// Always returns 200 fast; Meta retries aggressively on non-200 responses.
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => null)) as WhatsAppWebhookPayload | null;
    if (!body) return NextResponse.json({ ok: true });

    const admin = createAdminClient();

    for (const entry of body.entry ?? []) {
      for (const change of entry.changes ?? []) {
        const value = change.value;
        if (!value) continue;

        for (const message of value.messages ?? []) {
          await handleInboundMessage(admin, message);
        }
        for (const status of value.statuses ?? []) {
          await handleStatusUpdate(admin, status);
        }
      }
    }
  } catch (err) {
    console.error('[whatsapp-webhook] error processing payload', err);
  }

  return NextResponse.json({ ok: true });
}

/**
 * A customer messaged us (or tapped a template quick-reply button). This is
 * the key event that opens the free 24h WhatsApp service window, and where
 * we detect an opt-out (STOP).
 */
async function handleInboundMessage(admin: AdminClient, message: InboundMessage): Promise<void> {
  try {
    const phone = `+${message.from}`;
    const { data: profile } = await admin
      .from('profiles')
      .select('id, preferred_locale')
      .eq('phone', phone)
      .maybeSingle();
    if (!profile) return; // unknown number — nothing to link this to

    // THE KEY LINE: opens the free 24h service window.
    await admin
      .from('profiles')
      .update({ whatsapp_window_expires_at: new Date(Date.now() + 24 * 60 * 60_000).toISOString() } as never)
      .eq('id', profile.id);

    const bodyText = (message.text?.body ?? message.button?.text ?? '').trim().toLowerCase();
    const isStop = STOP_KEYWORDS.some((kw) => bodyText === kw.toLowerCase() || bodyText.includes(kw.toLowerCase()));

    if (isStop) {
      await admin.from('profiles').update({ whatsapp_opted_out: true } as never).eq('id', profile.id);

      const confirmText = profile.preferred_locale === 'en'
        ? "You've been unsubscribed from WhatsApp messages. Reply START to opt back in."
        : 'تم إلغاء اشتراكك في رسائل واتساب. للاشتراك مجدداً أرسل START.';
      // Free-form is fine here — we're inside the window we just opened above.
      await sendFreeformMessage({ toPhone: phone, text: confirmText });
    } else if (bodyText === 'start') {
      await admin.from('profiles').update({ whatsapp_opted_out: false } as never).eq('id', profile.id);
    }

    await admin.from('activity_log').insert({
      tenant_id: DEMO_TENANT_ID,
      actor_id: profile.id,
      action: 'whatsapp.inbound_received',
      entity_type: 'profile',
      entity_id: profile.id,
      after: { message_type: message.type, is_stop: isStop } as never,
    });
  } catch (err) {
    console.error('[whatsapp-webhook] handleInboundMessage failed', err);
  }
}

/** Delivery receipt — match by provider_message_id and update the notifications row. */
async function handleStatusUpdate(admin: AdminClient, status: StatusUpdate): Promise<void> {
  try {
    if (!['sent', 'delivered', 'read', 'failed'].includes(status.status)) return;

    const update: Record<string, unknown> = { status: status.status };
    const when = new Date(Number(status.timestamp) * 1000).toISOString();
    if (status.status === 'delivered') update.delivered_at = when;
    if (status.status === 'read') update.read_at = when;

    await admin.from('notifications').update(update as never).eq('provider_message_id', status.id);
  } catch (err) {
    console.error('[whatsapp-webhook] handleStatusUpdate failed', err);
  }
}
