import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import {
  extractPaymentCode,
  parseAmount,
  parseWebhookTransactions,
  sha256Hex,
  timingSafeEqualString,
  WebhookPayloadError,
} from './mb-webhook';

describe('extractPaymentCode', () => {
  it('extracts a single THPT code', () => {
    expect(extractPaymentCode('NGUYEN VAN A THPT12AB34CD chuyen tien')).toBe(
      'THPT12AB34CD',
    );
  });
  it('returns empty when absent', () => {
    expect(extractPaymentCode('chuyen tien hoc phi')).toBe('');
  });
  it('returns empty when ambiguous (multiple codes)', () => {
    expect(extractPaymentCode('THPT11111111 THPT22222222')).toBe('');
  });
});

describe('parseAmount', () => {
  it('parses plain integers and dotted VND', () => {
    expect(parseAmount('100000')).toBe(100000);
    expect(parseAmount('100.000')).toBe(100000);
    expect(parseAmount('1,250,000₫')).toBe(1250000);
    expect(parseAmount(50000)).toBe(50000);
  });
  it('rejects garbage', () => {
    expect(() => parseAmount('abc')).toThrow(WebhookPayloadError);
    expect(() => parseAmount(-5)).toThrow(WebhookPayloadError);
  });
});

describe('parseWebhookTransactions', () => {
  it('normalizes the MBBank V4 body', () => {
    const result = parseWebhookTransactions({
      status: 'success',
      transactions: [
        {
          type: 'IN',
          transactionID: 'FT2330001',
          amount: '100000',
          description: 'NGUYEN VAN A THPT12AB34CD',
        },
      ],
    });
    expect(result).toEqual([
      {
        providerEventId: 'FT2330001',
        direction: 'in',
        amount: 100000,
        content: 'NGUYEN VAN A THPT12AB34CD',
      },
    ]);
  });

  it('maps OUT to out', () => {
    const [tx] = parseWebhookTransactions({
      transactions: [{ type: 'OUT', transactionID: 'x', amount: '1', description: '' }],
    });
    expect(tx.direction).toBe('out');
  });

  it('rejects malformed bodies', () => {
    expect(() => parseWebhookTransactions({})).toThrow(WebhookPayloadError);
    expect(() => parseWebhookTransactions({ transactions: {} })).toThrow(
      WebhookPayloadError,
    );
  });

  it('requires a stable transaction id', () => {
    expect(() =>
      parseWebhookTransactions({
        transactions: [{ type: 'IN', transactionID: '', amount: '1', description: '' }],
      }),
    ).toThrow(WebhookPayloadError);
  });
});

describe('timingSafeEqualString', () => {
  it('is true only for exact matches', () => {
    expect(timingSafeEqualString('secret-123', 'secret-123')).toBe(true);
    expect(timingSafeEqualString('secret-123', 'secret-124')).toBe(false);
    expect(timingSafeEqualString('short', 'a-much-longer-secret')).toBe(false);
  });
});

describe('sha256Hex', () => {
  it('is deterministic', () => {
    expect(sha256Hex({ a: 1 })).toBe(sha256Hex({ a: 1 }));
    expect(sha256Hex({ a: 1 })).toMatch(/^[0-9a-f]{64}$/);
  });
});
