'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { RefreshCw, RotateCcw, ShieldAlert } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import styles from '@/styles/adminPurchase.module.css';

type Purchase = {
  id: string;
  student_id: string;
  status: string;
  amount: number;
  currency: string;
  payment_code: string;
  provider: string | null;
  provider_order_ref: string | null;
  created_at: string;
  paid_at: string | null;
  fulfilled_at: string | null;
  failure_code: string | null;
};

type PaymentEvent = {
  id: number;
  order_id: string | null;
  provider_event_id: string;
  event_type: string;
  received_at: string;
  processing_error: string | null;
};

export default function PurchasesClient() {
  const [orders, setOrders] = useState<Purchase[]>([]);
  const [events, setEvents] = useState<PaymentEvent[]>([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [feedback, setFeedback] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();
    let orderQuery = supabase
      .from('purchase_orders')
      .select(
        'id,student_id,status,amount,currency,payment_code,provider,provider_order_ref,created_at,paid_at,fulfilled_at,failure_code',
      )
      .order('created_at', { ascending: false })
      .limit(200);
    if (statusFilter) orderQuery = orderQuery.eq('status', statusFilter);

    const [orderResult, eventResult] = await Promise.all([
      orderQuery,
      supabase
        .from('payment_events')
        .select('id,order_id,provider_event_id,event_type,received_at,processing_error')
        .not('processing_error', 'is', null)
        .order('received_at', { ascending: false })
        .limit(200),
    ]);
    if (orderResult.error || eventResult.error) {
      setFeedback(orderResult.error?.message ?? eventResult.error?.message ?? '');
    } else {
      setOrders((orderResult.data ?? []) as Purchase[]);
      setEvents((eventResult.data ?? []) as PaymentEvent[]);
    }
    setLoading(false);
  }, [statusFilter]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const reconcile = async (orderId: string) => {
    setFeedback('');
    const supabase = createClient();
    const { error } = await supabase.rpc('reconcile_purchase_order', {
      p_order_id: orderId,
    });
    if (error) setFeedback(error.message);
    await load();
  };

  const revoke = async (orderId: string) => {
    const reason = window.prompt('Lý do refund/revoke:');
    if (!reason?.trim()) return;
    const supabase = createClient();
    const { error } = await supabase.rpc('revoke_purchase_order', {
      p_order_id: orderId,
      p_reason: reason.trim(),
    });
    if (error) setFeedback(error.message);
    await load();
  };

  return (
    <main className={styles.page}>
      <div className={styles.topbar}>
        <div>
          <p className={styles.eyebrow}>ADMIN · SEPAY</p>
          <h1>Đơn mua key</h1>
          <p>Đối soát đơn, xem giao dịch chưa khớp và retry fulfillment.</p>
        </div>
        <div className={styles.links}>
          <Link href="/admin/key-products">Gói key</Link>
          <Link href="/admin">Dashboard</Link>
        </div>
      </div>

      {feedback ? <p className={styles.error}>{feedback}</p> : null}
      <section className={styles.card}>
        <div className={styles.sectionHeader}>
          <h2>Orders</h2>
          <div className={styles.toolbar}>
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="">Tất cả trạng thái</option>
              <option value="pending">Pending</option>
              <option value="paid">Paid</option>
              <option value="fulfilled">Fulfilled</option>
              <option value="failed">Failed</option>
              <option value="refunded">Refunded</option>
            </select>
            <button
              className={styles.iconButton}
              type="button"
              onClick={() => void load()}
              aria-label="Tải lại đơn"
            >
              <RefreshCw size={16} />
            </button>
          </div>
        </div>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Mã chuyển khoản</th>
                <th>Student</th>
                <th>Số tiền</th>
                <th>Trạng thái</th>
                <th>Provider ref</th>
                <th>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <tr key={order.id}>
                  <td>
                    <strong>{order.payment_code}</strong>
                    <small>{order.id}</small>
                  </td>
                  <td><small>{order.student_id}</small></td>
                  <td>{order.amount.toLocaleString('vi-VN')} {order.currency}</td>
                  <td><span className={styles.status}>{order.status}</span></td>
                  <td>{order.provider_order_ref ?? '—'}</td>
                  <td className={styles.rowActions}>
                    <button
                      type="button"
                      onClick={() => void reconcile(order.id)}
                      disabled={order.status !== 'paid'}
                      title="Retry fulfillment"
                    >
                      <RotateCcw size={15} />
                    </button>
                    <button
                      type="button"
                      onClick={() => void revoke(order.id)}
                      disabled={order.status === 'refunded'}
                      title="Refund/revoke"
                    >
                      <ShieldAlert size={15} />
                    </button>
                  </td>
                </tr>
              ))}
              {!loading && orders.length === 0 ? (
                <tr><td colSpan={6}>Chưa có đơn.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className={styles.card}>
        <h2>Giao dịch SePay chưa khớp/lỗi</h2>
        <div className={styles.eventList}>
          {events.map((event) => (
            <div className={styles.eventRow} key={event.id}>
              <strong>{event.event_type}</strong>
              <span>{event.provider_event_id}</span>
              <span>{event.processing_error}</span>
              <small>{event.order_id ?? 'Không tìm thấy mã đơn'}</small>
            </div>
          ))}
          {!loading && events.length === 0 ? <p>Không có event lỗi.</p> : null}
        </div>
      </section>
    </main>
  );
}
