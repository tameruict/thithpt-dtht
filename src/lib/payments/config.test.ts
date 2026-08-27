import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import {
  getCheckoutBankDetails,
  getPaymentConfig,
  getPaymentPollFunctionConfig,
} from './config';

afterEach(() => {
  vi.unstubAllEnvs();
});

function stubPaymentEnv() {
  vi.stubEnv('PAYMENT_PROVIDER', ' THUEAPIBANK ');
  vi.stubEnv('PAYMENT_BANK_CODE', ' mbbank ');
  vi.stubEnv('PAYMENT_BANK_ACCOUNT', ' 0123  456\t789 ');
}

describe('payment checkout configuration', () => {
  it('normalizes bank details without requiring or returning an account name', () => {
    stubPaymentEnv();

    expect(getPaymentConfig()).toEqual({
      provider: 'thueapibank',
      bankCode: 'MBBANK',
      bankAccount: '0123456789',
    });
    expect(getCheckoutBankDetails()).toEqual({
      bankCode: 'MBBANK',
      bankAccount: '0123456789',
    });
  });

  it('rejects an account containing only whitespace after normalization', () => {
    stubPaymentEnv();
    vi.stubEnv('PAYMENT_BANK_ACCOUNT', ' \t\r\n ');

    expect(() => getPaymentConfig()).toThrow(
      'Missing payment server configuration: bankAccount',
    );
  });

  it('requires the poll URL and server-only poll secret', () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', ' https://project.example.test/ ');
    vi.stubEnv('THUEAPIBANK_POLL_SECRET', 'test-placeholder-secret');

    expect(getPaymentPollFunctionConfig()).toEqual({
      url: 'https://project.example.test/functions/v1/poll-thueapibank',
      pollSecret: 'test-placeholder-secret',
    });
  });
});
