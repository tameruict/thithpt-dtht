import { describe, expect, it } from 'vitest';
import {
  extractSepayPaymentCode,
  isSepayApiKeyHeader,
  parseSepayPaymentPayload,
} from './sepay';

describe('SePay webhook parser', () => {
  const payload = {
    id: 92704,
    code: '',
    content: 'Thanh toan THPTABC123456789',
    transferAmount: 125000,
    transferType: 'in',
    accountNumber: '1017588888',
    referenceCode: 'FT24012345678',
  };

  it('normalizes the documented payload and extracts payment code from content', () => {
    const result = parseSepayPaymentPayload(payload);
    expect(result).toEqual({
      ok: true,
      value: {
        eventId: '92704',
        amount: 125000,
        transferType: 'in',
        accountNumber: '1017588888',
        providerReference: 'FT24012345678',
        paymentCode: 'THPTABC123456789',
      },
    });
  });

  it('prefers a payment code in the provider code field', () => {
    expect(
      extractSepayPaymentCode({
        code: 'THPTZZZ123456789',
        content: 'THPTAAA123456789',
        description: null,
        referenceCode: null,
      }),
    ).toBe('THPTZZZ123456789');
  });

  it('rejects missing event, amount, transfer type, or account', () => {
    expect(parseSepayPaymentPayload({ ...payload, id: '' })).toEqual({
      ok: false,
      error: 'EVENT_ID_REQUIRED',
    });
    expect(parseSepayPaymentPayload({ ...payload, transferAmount: 'x' })).toEqual({
      ok: false,
      error: 'TRANSFER_AMOUNT_INVALID',
    });
    expect(parseSepayPaymentPayload({ ...payload, transferType: '' })).toEqual({
      ok: false,
      error: 'TRANSFER_TYPE_REQUIRED',
    });
    expect(parseSepayPaymentPayload({ ...payload, accountNumber: '' })).toEqual({
      ok: false,
      error: 'ACCOUNT_NUMBER_REQUIRED',
    });
  });

  it('validates the Apikey header shape without exposing the secret', () => {
    expect(isSepayApiKeyHeader('Apikey test-secret', 'test-secret')).toBe(true);
    expect(isSepayApiKeyHeader('apikey test-secret', 'test-secret')).toBe(true);
    expect(isSepayApiKeyHeader('Bearer test-secret', 'test-secret')).toBe(false);
    expect(isSepayApiKeyHeader('Apikey other', 'test-secret')).toBe(false);
  });
});
