import { describe, expect, it, vi } from 'vitest';

vi.mock('../../app/purchase/actions', () => ({
  createPurchaseOrder: vi.fn(),
}));
vi.mock('@/lib/supabase/client', () => ({
  createClient: vi.fn(),
}));

import {
  buildVietQrUrl,
  describePurchaseValidity,
  formatPricePerDay,
  getBestValueProductId,
  getPopularProductId,
  PURCHASE_SCOPE_LABEL,
  purchaseErrorLabel,
  purchaseOrderStatusLabel,
  type PurchaseProduct,
} from '../../app/purchase/PurchaseClient';

const VIP_WEEK: PurchaseProduct = {
  id: '11111111-1111-4111-8111-111111111111',
  code: 'VIP-WEEK',
  name: 'Gói VIP Tuần',
  product_kind: 'subscription',
  price_amount: 29000,
  currency: 'VND',
  valid_days: 7,
};
const VIP_MONTH: PurchaseProduct = {
  id: '22222222-2222-4222-8222-222222222222',
  code: 'VIP-MONTH',
  name: 'Gói VIP Tháng',
  product_kind: 'subscription',
  price_amount: 79000,
  currency: 'VND',
  valid_days: 30,
};
const VIP_YEAR: PurchaseProduct = {
  id: '33333333-3333-4333-8333-333333333333',
  code: 'VIP-YEAR',
  name: 'Gói VIP Năm',
  product_kind: 'subscription',
  price_amount: 199000,
  currency: 'VND',
  valid_days: 365,
};

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

  it('localizes terminal order states and actionable checkout errors', () => {
    expect(purchaseOrderStatusLabel('fulfilled')).toBe('Đã kích hoạt VIP');
    expect(purchaseOrderStatusLabel('expired')).toBe('Đã hết hạn');
    expect(purchaseErrorLabel('PRODUCT_NOT_AVAILABLE')).toContain('ngừng bán');
  });
});

describe('VIP subscription plan helpers', () => {
  it('describes validity in weeks/months/years instead of raw day counts', () => {
    expect(describePurchaseValidity(7)).toBe('hạn 1 tuần');
    expect(describePurchaseValidity(30)).toBe('hạn 30 ngày');
    expect(describePurchaseValidity(365)).toBe('hạn 1 năm');
    expect(describePurchaseValidity(null)).toBe('không giới hạn hạn dùng');
  });

  it('formats a per-day price to highlight the yearly plan value', () => {
    expect(formatPricePerDay(VIP_WEEK)).toBe('~4.143đ/ngày');
    expect(formatPricePerDay(VIP_MONTH)).toBe('~2.633đ/ngày');
    expect(formatPricePerDay(VIP_YEAR)).toBe('~545đ/ngày');
  });

  it('marks the monthly plan as most popular by product code', () => {
    expect(getPopularProductId([VIP_WEEK, VIP_MONTH, VIP_YEAR])).toBe(VIP_MONTH.id);
  });

  it('marks the plan with the lowest price/day as best value', () => {
    expect(getBestValueProductId([VIP_WEEK, VIP_MONTH, VIP_YEAR])).toBe(VIP_YEAR.id);
  });
});
