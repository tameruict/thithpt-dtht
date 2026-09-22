import 'server-only';

import { createHash, timingSafeEqual as nodeTimingSafeEqual } from 'node:crypto';

/**
 * Pure helpers for the ThueAPIBank / MBBank V4 integration on the Next.js side.
 *
 * The Deno edge function (`supabase/functions/_shared/thueapibank.ts`) owns the
 * richer polling contract parser; this module carries only what the realtime
 * webhook Route Handler needs so the two runtimes stay decoupled. The MBBank V4
 * webhook payload is intentionally small — see `Cấu hình Webhook MBBank V4.html`:
 *
 *   Headers: Content-Type: application/json, signature: {SECRET_KEY}
 *   Body: { status, message, transactions: [{ type, transactionID, amount, description }] }
 */

export type WebhookTransaction = {
  providerEventId: string;
  direction: 'in' | 'out';
  amount: number;
  content: string;
};

export class WebhookPayloadError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = 'WebhookPayloadError';
  }
}

// Matches the payment memo minted by create_purchase_order (THPT + 8-24 chars).
const paymentCodePattern = /(?<![A-Z0-9])(THPT[A-Z0-9]{8,24})(?![A-Z0-9])/gi;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Extracts the single THPT payment code from a transfer description. Returns ''
 * when there is no match or when the content is ambiguous (multiple codes) — the
 * DB RPC then records the event as invalid rather than fulfilling the wrong order.
 */
export function extractPaymentCode(content: string): string {
  const matches = Array.from(content.matchAll(paymentCodePattern), (match) =>
    match[1].toUpperCase(),
  );
  return matches.length === 1 ? matches[0] : '';
}

/** Parses amounts sent as "100000", "100.000", "100,000₫", or 100000. */
export function parseAmount(value: unknown): number {
  if (typeof value === 'number') {
    if (Number.isSafeInteger(value) && value >= 0) return value;
    throw new WebhookPayloadError('TRANSACTION_AMOUNT_INVALID');
  }
  if (typeof value !== 'string') {
    throw new WebhookPayloadError('TRANSACTION_AMOUNT_INVALID');
  }
  const compact = value.trim().replace(/\s|₫|đ|vnd/gi, '');
  if (/^\d+$/.test(compact)) return Number(compact);
  if (/^\d{1,3}(?:[.,]\d{3})+$/.test(compact)) {
    return Number(compact.replace(/[.,]/g, ''));
  }
  if (/^\d+[.,]00$/.test(compact)) {
    return Number(compact.slice(0, -3));
  }
  throw new WebhookPayloadError('TRANSACTION_AMOUNT_INVALID');
}

function normalizeDirection(value: unknown): 'in' | 'out' {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (['in', 'credit', 'received', '+'].includes(normalized)) return 'in';
  if (['out', 'debit', 'sent', '-'].includes(normalized)) return 'out';
  throw new WebhookPayloadError('TRANSACTION_DIRECTION_INVALID');
}

/**
 * Validates and normalizes the MBBank V4 webhook body into a list of
 * transactions. Throws WebhookPayloadError with a stable code on malformed input.
 */
export function parseWebhookTransactions(payload: unknown): WebhookTransaction[] {
  if (!isRecord(payload)) {
    throw new WebhookPayloadError('WEBHOOK_BODY_INVALID');
  }
  const items = payload.transactions;
  if (!Array.isArray(items)) {
    throw new WebhookPayloadError('WEBHOOK_TRANSACTIONS_MALFORMED');
  }

  return items.map((item) => {
    if (!isRecord(item)) {
      throw new WebhookPayloadError('TRANSACTION_RECORD_INVALID');
    }
    const providerEventId = String(item.transactionID ?? '').trim();
    if (!providerEventId) {
      throw new WebhookPayloadError('STABLE_EVENT_ID_REQUIRED');
    }
    return {
      providerEventId,
      direction: normalizeDirection(item.type),
      amount: parseAmount(item.amount),
      content: String(item.description ?? '').trim(),
    };
  });
}

/** SHA-256 hex digest of the JSON-serialized payload (evidence fingerprint). */
export function sha256Hex(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

/** Constant-time string comparison that does not leak length via early return. */
export function timingSafeEqualString(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, 'utf8');
  const rightBuffer = Buffer.from(right, 'utf8');
  // nodeTimingSafeEqual requires equal-length buffers; pad to the longer length
  // so a length mismatch still runs the full comparison before failing.
  const length = Math.max(leftBuffer.length, rightBuffer.length, 1);
  const leftPadded = Buffer.alloc(length);
  const rightPadded = Buffer.alloc(length);
  leftBuffer.copy(leftPadded);
  rightBuffer.copy(rightPadded);
  return (
    nodeTimingSafeEqual(leftPadded, rightPadded) &&
    leftBuffer.length === rightBuffer.length
  );
}
