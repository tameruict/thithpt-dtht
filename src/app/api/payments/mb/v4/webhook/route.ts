import type { NextRequest } from 'next/server';
import {
  getPaymentConfig,
  getWebhookSecret,
  isKeyPurchaseEnabled,
} from '@/lib/payments/config';
import {
  extractPaymentCode,
  parseWebhookTransactions,
  sha256Hex,
  timingSafeEqualString,
  WebhookPayloadError,
} from '@/lib/payments/mb-webhook';
import { createServiceClient } from '@/lib/supabase/service';
import type { Json } from '@/lib/supabase/database';

// Realtime receiver for ThueAPIBank / MBBank V4 balance-change webhooks.
// The provider POSTs here on every transaction; polling (poll-thueapibank edge
// function) remains the fallback, as the MBBank V4 docs recommend running both.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function json(body: Record<string, unknown>, status: number) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: NextRequest) {
  if (!isKeyPurchaseEnabled()) {
    return json({ status: false, msg: 'CHECKOUT_DISABLED' }, 503);
  }

  let webhookSecret: string;
  let expectedBankCode: string;
  let expectedAccountNumber: string;
  try {
    webhookSecret = getWebhookSecret();
    const config = getPaymentConfig();
    expectedBankCode = config.bankCode.toUpperCase();
    expectedAccountNumber = config.bankAccount.replace(/\s+/g, '');
  } catch {
    return json({ status: false, msg: 'WEBHOOK_NOT_CONFIGURED' }, 503);
  }

  // Auth: the provider sends the secret in the `signature` header (see docs).
  const suppliedSecret = request.headers.get('signature') ?? '';
  if (!timingSafeEqualString(suppliedSecret, webhookSecret)) {
    return json({ status: false, msg: 'Invalid Signature' }, 401);
  }

  let rawPayload: unknown;
  try {
    rawPayload = await request.json();
  } catch {
    return json({ status: false, msg: 'INVALID_JSON' }, 400);
  }

  let transactions;
  try {
    transactions = parseWebhookTransactions(rawPayload);
  } catch (error) {
    const code = error instanceof WebhookPayloadError ? error.code : 'WEBHOOK_BODY_INVALID';
    return json({ status: false, msg: code }, 400);
  }

  const supabase = createServiceClient();
  // Received on our registered account, so the receiving account/bank is implied.
  const receivedAt = new Date().toISOString();

  const results: { transactionID: string; ok: boolean; error?: string }[] = [];
  for (const tx of transactions) {
    const { error } = await supabase.rpc('process_bank_payment', {
      p_provider: 'thueapibank',
      p_provider_event_id: tx.providerEventId,
      p_transaction_at: receivedAt,
      p_direction: tx.direction,
      p_amount: tx.amount,
      p_content: tx.content,
      p_payment_code: extractPaymentCode(tx.content),
      p_account_number: expectedAccountNumber,
      p_expected_account_number: expectedAccountNumber,
      p_bank_code: expectedBankCode,
      p_expected_bank_code: expectedBankCode,
      p_provider_reference: null as unknown as string,
      p_payload: tx as unknown as Json,
      p_payload_sha256: sha256Hex(tx),
    });
    results.push({
      transactionID: tx.providerEventId,
      ok: !error,
      error: error?.message,
    });
  }

  // The DB RPC is idempotent and records unmatched transfers as evidence rather
  // than failing, so an OK response prevents the provider's 10x retry loop for
  // events we have already durably captured. If a genuine DB error occurred,
  // return 500 so the provider retries later.
  const hadDbError = results.some((r) => !r.ok);
  if (hadDbError) {
    return json({ status: false, msg: 'PROCESSING_ERROR', results }, 500);
  }

  return json({ status: true, msg: 'OK', processed: results.length }, 200);
}
