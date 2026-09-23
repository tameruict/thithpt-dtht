import { describe, expect, it, vi } from 'vitest';

vi.mock('../../app/purchase/actions', () => ({
  createPurchaseOrder: vi.fn(),
}));
vi.mock('@/lib/supabase/client', () => ({
  createClient: vi.fn(),
}));

import {
  buildVietQrUrl,
  describePurchaseTerms,
  PURCHASE_SCOPE_LABEL,
  purchaseErrorLabel,
  purchaseOrderStatusLabel,
} from '../../app/purchase/PurchaseClient';

describe('VietQR checkout URL', () => {
  it('labels every paid key as usable for exams and practice', () => {
    expect(PURCHASE_SCOPE_LABEL).toBe('Dùng cho tất cả phòng thi và tự luyện');
  });

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
    expect(parsed.pathname).toBe('/image/MBBANK-0123456789-qr_only.png');
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

  it('describes an unlimited-retake 1-year bundle in words, not raw numbers', () => {
    expect(describePurchaseTerms({ attempt_count: 999999, valid_days: 365 })).toBe(
      'Không giới hạn lượt làm lại · hạn 1 năm',
    );
  });

  it('keeps finite bundles as attempt counts and day-based validity', () => {
    expect(describePurchaseTerms({ attempt_count: 10, valid_days: 30 })).toBe(
      '10 lượt · hạn 30 ngày',
    );
    expect(describePurchaseTerms({ attempt_count: 5, valid_days: null })).toBe(
      '5 lượt · không giới hạn hạn dùng',
    );
  });

  it('localizes terminal order states and actionable checkout errors', () => {
    expect(purchaseOrderStatusLabel('fulfilled')).toBe('Đã cấp key');
    expect(purchaseOrderStatusLabel('expired')).toBe('Đã hết hạn');
    expect(purchaseErrorLabel('PRODUCT_NOT_AVAILABLE')).toContain('ngừng bán');
  });
});
