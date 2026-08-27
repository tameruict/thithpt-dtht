export type SepayWebhookPayload = {
  id: string | number;
  code?: string | null;
  content?: string | null;
  description?: string | null;
  transferAmount: string | number;
  transferType: string;
  accountNumber: string;
  referenceCode?: string | null;
  [key: string]: unknown;
};

export type ParsedSepayPayment = {
  eventId: string;
  amount: number;
  transferType: string;
  accountNumber: string;
  providerReference: string;
  paymentCode: string;
};

export type SepayParseResult =
  | { ok: true; value: ParsedSepayPayment }
  | { ok: false; error: string };

const paymentCodePattern = /\b(THPT[A-Z0-9]{8,24})\b/i;

function asTrimmedString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

export function extractSepayPaymentCode(payload: Pick<
  SepayWebhookPayload,
  'code' | 'content' | 'description' | 'referenceCode'
>) {
  const candidates = [
    payload.code,
    payload.content,
    payload.description,
    payload.referenceCode,
  ];

  for (const candidate of candidates) {
    const value = asTrimmedString(candidate);
    const match = value.match(paymentCodePattern);
    if (match) return match[1].toUpperCase();
  }

  return '';
}

export function parseSepayPaymentPayload(
  input: unknown,
): SepayParseResult {
  if (!input || typeof input !== 'object') {
    return { ok: false, error: 'PAYLOAD_INVALID' };
  }

  const payload = input as Partial<SepayWebhookPayload>;
  const eventId = String(payload.id ?? '').trim();
  const amount = Number(payload.transferAmount);
  const transferType = asTrimmedString(payload.transferType).toLowerCase();
  const accountNumber = asTrimmedString(payload.accountNumber);

  if (!eventId) return { ok: false, error: 'EVENT_ID_REQUIRED' };
  if (!Number.isSafeInteger(amount) || amount < 0) {
    return { ok: false, error: 'TRANSFER_AMOUNT_INVALID' };
  }
  if (!transferType) return { ok: false, error: 'TRANSFER_TYPE_REQUIRED' };
  if (!accountNumber) return { ok: false, error: 'ACCOUNT_NUMBER_REQUIRED' };

  return {
    ok: true,
    value: {
      eventId,
      amount,
      transferType,
      accountNumber,
      providerReference: asTrimmedString(payload.referenceCode),
      paymentCode: extractSepayPaymentCode(payload),
    },
  };
}

export function isSepayApiKeyHeader(
  authorizationHeader: string | null | undefined,
  expectedApiKey: string,
) {
  const match = authorizationHeader?.match(/^Apikey\s+(.+)$/i);
  return Boolean(
    expectedApiKey &&
      match &&
      match[1].trim().length > 0 &&
      match[1].trim() === expectedApiKey,
  );
}
