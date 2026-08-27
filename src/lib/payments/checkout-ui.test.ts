import { describe, expect, it, vi } from 'vitest';

vi.mock('../../app/purchase/actions', () => ({
  createPurchaseOrder: vi.fn(),
}));
vi.mock('@/lib/supabase/client', () => ({
  createClient: vi.fn(),
}));

import { buildVietQrUrl } from '../../app/purchase/PurchaseClient';

describe('VietQR checkout URL', () => {
  it('uses normalized bank/account path and only amount/addInfo query fields', () => {
    const qrUrl = buildVietQrUrl(
      { bankCode: ' mbbank ', bankAccount: ' 0123 456\t789 ' },
      {
        amount: 125000,
        currency: 'VND',
        paymentCode: 'THPT ABC 123',
      },
    );
    const parsed = new URL(qrUrl);

    expect(parsed.origin).toBe('https://img.vietqr.io');
    expect(parsed.pathname).toBe('/image/MBBANK-0123456789-compact2.png');
    expect([...parsed.searchParams.entries()]).toEqual([
      ['amount', '125000'],
      ['addInfo', 'THPT ABC 123'],
    ]);
  });

  it('does not build a transfer QR for a non-VND order', () => {
    expect(
      buildVietQrUrl(
        { bankCode: 'MBBANK', bankAccount: '0123456789' },
        { amount: 10, currency: 'USD', paymentCode: 'THPTABC123456789' },
      ),
    ).toBe('');
  });
});
