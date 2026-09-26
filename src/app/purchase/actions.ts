'use server';

import { randomUUID } from 'node:crypto';
import {
  getPaymentConfig,
  getPaymentPollFunctionConfig,
  isKeyPurchaseEnabled,
} from '@/lib/payments/config';
import { createClient } from '@/lib/supabase/server';

export type CreatePurchaseOrderResult =
  | {
      ok: true;
      order: {
        orderId: string;
        paymentCode: string;
        amount: number;
        currency: string;
        status: string;
        expiresAt: string | null;
        productSnapshot: Record<string, unknown>;
      };
    }
  | { ok: false; error: string };

function asRecord(value: unknown) {
  return value && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : null;
}

export async function createPurchaseOrder(
  productId: string,
  idempotencyKey: string = randomUUID(),
  couponCode?: string,
  targetKeyId?: string,
): Promise<CreatePurchaseOrderResult> {
  if (!isKeyPurchaseEnabled()) {
    return { ok: false, error: 'CHECKOUT_DISABLED' };
  }

  if (!/^[0-9a-f-]{36}$/i.test(productId)) {
    return { ok: false, error: 'PRODUCT_ID_INVALID' };
  }
  if (!/^[a-zA-Z0-9._:-]{12,120}$/.test(idempotencyKey)) {
    return { ok: false, error: 'IDEMPOTENCY_KEY_INVALID' };
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { ok: false, error: 'NOT_AUTHENTICATED' };
  }

  try {
    getPaymentConfig();
    getPaymentPollFunctionConfig();
  } catch {
    return { ok: false, error: 'CHECKOUT_CONFIGURATION_INVALID' };
  }

  const { data: product, error: productError } = await supabase
    .from('key_products')
    .select('currency,product_kind')
    .eq('id', productId)
    .eq('is_active', true)
    .is('archived_at', null)
    .maybeSingle();

  if (productError) {
    return { ok: false, error: 'PRODUCT_LOOKUP_FAILED' };
  }
  if (!product) {
    return { ok: false, error: 'PRODUCT_NOT_AVAILABLE' };
  }
  if (product.currency !== 'VND') {
    return { ok: false, error: 'PAYMENT_CURRENCY_UNSUPPORTED' };
  }
  // Gói lượt (bundle, đã archive) và gói VIP theo thời gian (subscription) đều
  // đi qua cùng luồng QR/đối soát này; các product_kind khác (exam/practice
  // đơn lẻ...) không được bán qua kênh này.
  if (product.product_kind !== 'bundle' && product.product_kind !== 'subscription') {
    return { ok: false, error: 'PRODUCT_SCOPE_UNSUPPORTED' };
  }

  const normalizedCoupon = couponCode?.trim().toUpperCase() ?? '';
  if (normalizedCoupon && !/^[A-Z0-9_-]{3,32}$/.test(normalizedCoupon)) {
    return { ok: false, error: 'COUPON_INVALID' };
  }
  if (targetKeyId && !/^[0-9a-f-]{36}$/i.test(targetKeyId)) {
    return { ok: false, error: 'TARGET_KEY_INVALID' };
  }

  const { data, error } = await supabase.rpc('create_purchase_order', {
    p_product_id: productId,
    p_idempotency_key: idempotencyKey,
    p_coupon_code: normalizedCoupon ? normalizedCoupon : null,
    p_target_key_id: targetKeyId ?? null,
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  const order = asRecord(data);
  const snapshot = asRecord(order?.product_snapshot);
  if (
    !order ||
    typeof order.order_id !== 'string' ||
    typeof order.payment_code !== 'string' ||
    typeof order.amount !== 'number' ||
    order.currency !== 'VND' ||
    typeof order.status !== 'string'
  ) {
    return { ok: false, error: 'PURCHASE_ORDER_RESPONSE_INVALID' };
  }

  return {
    ok: true,
    order: {
      orderId: order.order_id,
      paymentCode: order.payment_code,
      amount: order.amount,
      currency: order.currency,
      status: order.status,
      expiresAt: typeof order.expires_at === 'string' ? order.expires_at : null,
      productSnapshot: snapshot ?? {},
    },
  };
}
