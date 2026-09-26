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
  formatPurchaseCountdown,
  getRecommendedProductId,
  getSavingsPercent,
  PURCHASE_SCOPE_LABEL,
  purchaseErrorLabel,
  purchaseOrderStatusLabel,
} from '../../app/purchase/PurchaseClient';

describe('VietQR checkout URL', () => {
  it('labels every paid key as usable for exams and practice', () => {
    expect(PURCHASE_SCOPE_LABEL).toBe(
      'Dùng chung cho tất cả phòng thi; khu tự luyện vẫn miễn phí',
    );
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

  it('counts down the 10-minute QR window and stops at zero', () => {
    const createdAt = Date.parse('2026-09-23T05:00:00.000Z');
    const expiresAt = '2026-09-23T05:10:00.000Z';

    expect(formatPurchaseCountdown(expiresAt, createdAt)).toBe('10:00');
    expect(formatPurchaseCountdown(expiresAt, createdAt + 9 * 60_000 + 59_000)).toBe('00:01');
    expect(formatPurchaseCountdown(expiresAt, createdAt + 10 * 60_000)).toBe('00:00');
  });

  it('recommends the revenue-focused middle plan and calculates honest savings', () => {
    const products = [
      {
        id: 'starter',
        code: 'BUNDLE-10',
        name: 'Gói Khởi động',
        product_kind: 'bundle' as const,
        attempt_count: 10,
        price_amount: 79000,
        currency: 'VND',
        valid_days: 30,
      },
      {
        id: 'growth',
        code: 'BUNDLE-40',
        name: 'Gói Tăng tốc',
        product_kind: 'bundle' as const,
        attempt_count: 40,
        price_amount: 149000,
        currency: 'VND',
        valid_days: 120,
      },
      {
        id: 'vip',
        code: 'VIP-1Y',
        name: 'Gói Chinh phục',
        product_kind: 'bundle' as const,
        attempt_count: 999999,
        price_amount: 299000,
        currency: 'VND',
        valid_days: 365,
      },
    ];

    expect(getRecommendedProductId(products)).toBe('growth');
    expect(getSavingsPercent(products[1], products[0])).toBe(53);
    expect(getSavingsPercent(products[2], products[0])).toBe(0);
  });
});
