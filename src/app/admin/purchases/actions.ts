'use server';

import { requireAdmin } from '@/lib/supabase/admin';

export type ConfirmManualPaymentResult =
  | { ok: true; status: string; keyCode: string | null }
  | { ok: false; error: string };

/**
 * Xác nhận thủ công đơn pending (khách chuyển khoản rồi inbox Zalo).
 * Đánh dấu paid với provider='manual_zalo' rồi gọi reconcile để cấp key.
 * Chỉ admin mới gọi được (requireAdmin + RLS + RPC gate).
 */
export async function confirmManualPayment(
  orderId: string,
): Promise<ConfirmManualPaymentResult> {
  if (!/^[0-9a-f-]{36}$/i.test(orderId)) {
    return { ok: false, error: 'ORDER_ID_INVALID' };
  }

  const { supabase } = await requireAdmin();

  const { data: order, error: fetchError } = await supabase
    .from('purchase_orders')
    .select('id,status')
    .eq('id', orderId)
    .maybeSingle();

  if (fetchError) {
    return { ok: false, error: fetchError.message };
  }
  if (!order) {
    return { ok: false, error: 'PURCHASE_ORDER_NOT_FOUND' };
  }
  if (order.status !== 'pending') {
    return { ok: false, error: 'PURCHASE_ORDER_NOT_PENDING' };
  }

  const { error: updateError } = await supabase
    .from('purchase_orders')
    .update({
      status: 'paid',
      provider: 'manual_zalo',
      paid_at: new Date().toISOString(),
    })
    .eq('id', orderId)
    .eq('status', 'pending');

  if (updateError) {
    return { ok: false, error: updateError.message };
  }

  const { data, error: rpcError } = await supabase.rpc(
    'reconcile_purchase_order',
    { p_order_id: orderId },
  );

  if (rpcError) {
    return { ok: false, error: rpcError.message };
  }

  const result = (data ?? {}) as { status?: unknown; key_code?: unknown };
  return {
    ok: true,
    status: typeof result.status === 'string' ? result.status : 'fulfilled',
    keyCode: typeof result.key_code === 'string' ? result.key_code : null,
  };
}
