import { type NextRequest, NextResponse } from 'next/server';
import { applyPaidTopUp, fetchMoyasarPayment } from '@/lib/moyasar';

export const runtime = 'nodejs';

// Webhook endpoint: POST /api/webhooks/moyasar
// Register this URL in the Moyasar dashboard under Webhooks.
// Set the secret to match MOYASAR_WEBHOOK_SECRET in your env.
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  // Verify webhook secret (Moyasar sends it as `secret_token` in the body)
  const webhookSecret = process.env.MOYASAR_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error('[moyasar-webhook] MOYASAR_WEBHOOK_SECRET not configured');
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }

  const receivedSecret =
    (body.secret_token as string | undefined) ??
    req.headers.get('x-moyasar-secret') ??
    null;

  if (receivedSecret !== webhookSecret) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  // Moyasar webhook payload: { type, data: { id, status, amount, metadata, ... }, secret_token }
  const payment = (body.data ?? {}) as Record<string, unknown>;
  const moyasarPaymentId = payment.id as string | undefined;

  if (!moyasarPaymentId) {
    // Not a payment event we handle
    return NextResponse.json({ ok: true });
  }

  if (payment.status !== 'paid') {
    // Payment not yet captured — nothing to do
    return NextResponse.json({ ok: true });
  }

  const metadata = ((payment.metadata ?? {}) as Record<string, string>);
  const internalPaymentId = metadata.internal_payment_id;

  if (!internalPaymentId) {
    // Payment didn't originate from our top-up flow
    console.warn('[moyasar-webhook] missing internal_payment_id on payment', moyasarPaymentId);
    return NextResponse.json({ ok: true });
  }

  try {
    // Independently verify the payment status via Moyasar API (don't trust webhook body alone)
    const verifiedPayment = await fetchMoyasarPayment(moyasarPaymentId);

    if (verifiedPayment.status !== 'paid') {
      console.warn('[moyasar-webhook] payment not paid per API', moyasarPaymentId);
      return NextResponse.json({ ok: true });
    }

    const result = await applyPaidTopUp({
      moyasarPaymentId,
      moyasarPayment: verifiedPayment,
      internalPaymentId,
    });

    if (result.alreadyProcessed) {
      console.log('[moyasar-webhook] already processed (idempotent skip)', moyasarPaymentId);
    } else {
      console.log('[moyasar-webhook] wallet credited for payment', moyasarPaymentId);
    }
  } catch (err) {
    console.error('[moyasar-webhook] error processing payment', moyasarPaymentId, err);
    // Return 5xx so Moyasar retries the webhook
    return NextResponse.json({ error: 'processing_error' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
