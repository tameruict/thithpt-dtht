import { createHash } from 'node:crypto';
import { isKeyPurchaseEnabled, getSepayConfig } from '@/lib/payments/config';
import {
  isSepayApiKeyHeader,
  parseSepayPaymentPayload,
} from '@/lib/payments/sepay';
import { createServiceClient } from '@/lib/supabase/service';
import type { Json } from '@/lib/supabase/database';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function json(body: Record<string, unknown>, status: number) {
  return Response.json(body, { status });
}

export async function POST(request: Request) {
  if (!isKeyPurchaseEnabled()) {
    return json({ success: false, error: 'CHECKOUT_DISABLED' }, 503);
  }

  let config;
  try {
    config = getSepayConfig();
  } catch {
    return json({ success: false, error: 'WEBHOOK_NOT_CONFIGURED' }, 503);
  }

  if (
    !isSepayApiKeyHeader(
      request.headers.get('authorization'),
      config.webhookApiKey,
    )
  ) {
    return json({ success: false, error: 'UNAUTHORIZED' }, 401);
  }

  const rawBody = await request.text();
  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return json({ success: false, error: 'PAYLOAD_INVALID' }, 400);
  }

  const parsed = parseSepayPaymentPayload(payload);
  if (!parsed.ok) {
    return json({ success: false, error: parsed.error }, 422);
  }

  const digest = createHash('sha256').update(rawBody, 'utf8').digest('hex');
  const supabase = createServiceClient();
  const { data, error } = await supabase.rpc('process_sepay_payment', {
    p_provider_event_id: parsed.value.eventId,
    p_payment_code: parsed.value.paymentCode,
    p_amount: parsed.value.amount,
    p_transfer_type: parsed.value.transferType,
    p_account_number: parsed.value.accountNumber,
    p_expected_account_number: config.bankAccount,
    p_provider_reference: parsed.value.providerReference || null,
    p_payload: payload as Json,
    p_payload_sha256: digest,
  });

  if (error) {
    return json({ success: false, error: 'PAYMENT_PROCESSING_FAILED' }, 500);
  }

  // Invalid account/amount/type and unmatched codes are durable reconciliation
  // events. A 2xx response prevents SePay from retrying a transaction that
  // cannot result in entitlement.
  return json({ success: true, result: data }, 200);
}
