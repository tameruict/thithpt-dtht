'use client';

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Download, Inbox, Play, RefreshCw, RotateCcw, Search, ShieldAlert, BadgeCheck } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { showToast } from '@/components/ui/Toast';
import { confirmManualPayment } from './actions';
import AdminSuiteNav from '../AdminSuiteNav';
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

type ProviderState = {
  provider: string;
  cursor: string | null;
  locked_until: string | null;
  last_polled_at: string | null;
  last_success_at: string | null;
  last_error_code: string | null;
  auto_fulfillment_enabled: boolean;
};

const ORDERS_PAGE_SIZE = 15;
const EVENTS_PAGE_SIZE = 10;

const purchaseStatusLabels: Record<string, string> = {
  pending: 'Chờ chuyển khoản',
  paid: 'Đã nhận tiền',
  fulfilled: 'Đã cấp key',
  failed: 'Thất bại',
  refunded: 'Đã hoàn tiền',
  expired: 'Hết hạn',
};

function csvCell(value: string | number | null | undefined) {
  const text = value === null || value === undefined ? '' : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

export default function PurchasesClient() {
  const [orders, setOrders] = useState<Purchase[]>([]);
  const [events, setEvents] = useState<PaymentEvent[]>([]);
  const [providerState, setProviderState] = useState<ProviderState | null>(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [feedback, setFeedback] = useState('');
  const [loading, setLoading] = useState(true);
  const [polling, setPolling] = useState(false);
  const [ordersPage, setOrdersPage] = useState(1);
  const [eventsPage, setEventsPage] = useState(1);
  const [revokeId, setRevokeId] = useState<string | null>(null);
  const [revokeReason, setRevokeReason] = useState('');
  const [revoking, setRevoking] = useState(false);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [manualOrder, setManualOrder] = useState<{ id: string; paymentCode: string } | null>(null);
  const revokeInputRef = useRef<HTMLInputElement>(null);
  const revokeTriggerRef = useRef<HTMLButtonElement | null>(null);
  const manualConfirmRef = useRef<HTMLButtonElement>(null);
  const manualTriggerRef = useRef<HTMLButtonElement | null>(null);
  const deferredSearch = useDeferredValue(search);

  const load = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();
    const orderQuery = supabase
      .from('purchase_orders')
      .select(
        'id,student_id,status,amount,currency,payment_code,provider,provider_order_ref,created_at,paid_at,fulfilled_at,failure_code',
      )
      .order('created_at', { ascending: false })
      .limit(200);
    const [orderResult, eventResult, providerResult] = await Promise.all([
      orderQuery,
      supabase
        .from('payment_events')
        .select('id,order_id,provider_event_id,event_type,received_at,processing_error')
        .not('processing_error', 'is', null)
        .order('received_at', { ascending: false })
        .limit(200),
      supabase
        .from('payment_provider_state')
        .select(
          'provider,cursor,locked_until,last_polled_at,last_success_at,last_error_code,auto_fulfillment_enabled',
        )
        .eq('provider', 'thueapibank')
        .maybeSingle(),
    ]);
    if (orderResult.error || eventResult.error || providerResult.error) {
      const message =
        orderResult.error?.message ??
        eventResult.error?.message ??
        providerResult.error?.message ??
        '';
      setFeedback(message);
    } else {
      setOrders((orderResult.data ?? []) as Purchase[]);
      setEvents((eventResult.data ?? []) as PaymentEvent[]);
      setProviderState((providerResult.data as ProviderState | null) ?? null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  // Reset trang trong onChange (không dùng effect). Memo phân trang vẫn clamp page.
  useEffect(() => {
    if (revokeId) revokeInputRef.current?.focus();
  }, [revokeId]);

  const closeRevokeDialog = () => {
    if (revoking) return;
    setRevokeId(null);
    window.setTimeout(() => revokeTriggerRef.current?.focus(), 0);
  };

  useEffect(() => {
    if (manualOrder) manualConfirmRef.current?.focus();
  }, [manualOrder]);

  const closeManualDialog = () => {
    if (confirmingId) return;
    setManualOrder(null);
    window.setTimeout(() => manualTriggerRef.current?.focus(), 0);
  };

  // UI search phục vụ lọc server-side sau này; hiện giữ query cũ + lọc client.
  // TODO(server-search): thêm .ilike('payment_code', ...)/cursor khi đơn nhiều.
  const filteredOrders = useMemo(() => {
    const term = deferredSearch.trim().toLowerCase();
    return orders.filter((order) => {
      if (statusFilter && order.status !== statusFilter) return false;
      if (!term) return true;
      return [order.payment_code, order.student_id, order.provider_order_ref ?? '', order.id].some((value) =>
        value.toLowerCase().includes(term),
      );
    });
  }, [orders, deferredSearch, statusFilter]);

  const stats = useMemo(() => {
    let pending = 0;
    let paid = 0;
    let fulfilled = 0;
    let failed = 0;
    let revenue = 0;
    for (const order of orders) {
      if (order.status === 'pending') pending += 1;
      else if (order.status === 'paid') paid += 1;
      else if (order.status === 'fulfilled') {
        fulfilled += 1;
        revenue += order.amount;
      } else if (order.status === 'failed') failed += 1;
    }
    return { total: orders.length, pending, paid, fulfilled, failed, revenue };
  }, [orders]);

  const ordersPageCount = Math.max(1, Math.ceil(filteredOrders.length / ORDERS_PAGE_SIZE));
  const safeOrdersPage = Math.min(ordersPage, ordersPageCount);
  const pagedOrders = filteredOrders.slice(
    (safeOrdersPage - 1) * ORDERS_PAGE_SIZE,
    safeOrdersPage * ORDERS_PAGE_SIZE,
  );

  const eventsPageCount = Math.max(1, Math.ceil(events.length / EVENTS_PAGE_SIZE));
  const safeEventsPage = Math.min(eventsPage, eventsPageCount);
  const pagedEvents = events.slice(
    (safeEventsPage - 1) * EVENTS_PAGE_SIZE,
    safeEventsPage * EVENTS_PAGE_SIZE,
  );

  const reconcile = async (orderId: string) => {
    setFeedback('');
    const supabase = createClient();
    const { error } = await supabase.rpc('reconcile_purchase_order', {
      p_order_id: orderId,
    });
    if (error) {
      setFeedback(error.message);
      showToast(error.message, 'error');
    } else {
      showToast('Đã gửi yêu cầu đối soát đơn.', 'success');
    }
    await load();
  };

  const confirmManual = async (orderId: string) => {
    setConfirmingId(orderId);
    setFeedback('');
    try {
      const result = await confirmManualPayment(orderId);
      if (!result.ok) {
        setFeedback(result.error);
        showToast(result.error, 'error');
      } else {
        showToast(
          result.keyCode ? `Đã cấp key ${result.keyCode}.` : 'Đã xác nhận thanh toán.',
          'success',
        );
      }
    } catch {
      setFeedback('CONFIRM_MANUAL_FAILED');
      showToast('Không xác nhận được đơn.', 'error');
    } finally {
      setConfirmingId(null);
      setManualOrder(null);
      window.setTimeout(() => manualTriggerRef.current?.focus(), 0);
      await load();
    }
  };

  const revoke = async () => {
    if (!revokeId) return;
    const reason = revokeReason.trim();
    if (!reason) {
      setFeedback('Nhập lý do refund/revoke.');
      return;
    }
    setRevoking(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.rpc('revoke_purchase_order', {
        p_order_id: revokeId,
        p_reason: reason,
      });
      if (error) {
        setFeedback(error.message);
        showToast(error.message, 'error');
      } else {
        showToast('Đã revoke đơn.', 'success');
      }
      setRevokeId(null);
      await load();
    } finally {
      setRevoking(false);
      window.setTimeout(() => revokeTriggerRef.current?.focus(), 0);
    }
  };

  const pollNow = async () => {
    setPolling(true);
    setFeedback('');
    try {
      const response = await fetch('/api/admin/payments/poll', {
        method: 'POST',
      });
      const result = (await response.json()) as {
        success?: boolean;
        processed?: number;
        error?: string;
      };
      const message = result.success
        ? `Đã đồng bộ ThueAPIBank: ${result.processed ?? 0} giao dịch.`
        : result.error ?? 'POLL_FAILED';
      setFeedback(message);
      showToast(message, result.success ? 'success' : 'error');
      await load();
    } catch {
      setFeedback('POLLER_UNREACHABLE');
      showToast('Không kết nối được poller.', 'error');
    } finally {
      setPolling(false);
    }
  };

  const handleExport = () => {
    if (filteredOrders.length === 0) return;
    const header = ['Mã CK', 'Order ID', 'Student', 'Số tiền', 'Tiền tệ', 'Trạng thái', 'Provider ref', 'Tạo lúc'];
    const lines = filteredOrders.map((order) =>
      [
        csvCell(order.payment_code),
        csvCell(order.id),
        csvCell(order.student_id),
        csvCell(order.amount),
        csvCell(order.currency),
        csvCell(order.status),
        csvCell(order.provider_order_ref ?? ''),
        csvCell(new Date(order.created_at).toLocaleString('vi-VN')),
      ].join(','),
    );
    const blob = new Blob([`﻿${[header.map(csvCell).join(','), ...lines].join('\r\n')}`], {
      type: 'text/csv;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'don-mua-key.csv';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    showToast(`Đã xuất ${filteredOrders.length} đơn ra CSV.`, 'success');
  };

  return (
    <main className={styles.page} id="main">
      <div className={styles.topbar}>
        <div>
          <p className={styles.eyebrow}>ADMIN · THUEAPIBANK</p>
          <h1>Đơn mua key</h1>
          <p>Đối soát đơn, xem giao dịch chưa khớp và retry fulfillment.</p>
        </div>
        <div className={styles.links}>
          <button
            type="button"
            className={styles.syncButton}
            onClick={() => void pollNow()}
            disabled={polling}
          >
            <Play size={15} aria-hidden="true" />
            {polling ? 'Đang đồng bộ...' : 'Đồng bộ ThueAPIBank ngay'}
          </button>
        </div>
      </div>

      <AdminSuiteNav active="revenue" />

      {feedback ? <p className={`${styles.error} ${styles.feedback}`} role="status" aria-live="polite">{feedback}</p> : null}
      <section className={styles.providerStatus} aria-label="Trạng thái cổng thanh toán">
        <div>
          <span>Tự động cấp key</span>
          <strong>
            {providerState?.auto_fulfillment_enabled ? 'Đang bật' : 'Đang tắt'}
          </strong>
        </div>
        <div>
          <span>Poll thành công gần nhất</span>
          <strong>
            {providerState?.last_success_at
              ? new Date(providerState.last_success_at).toLocaleString('vi-VN')
              : 'Chưa có'}
          </strong>
        </div>
        <div>
          <span>Lỗi gần nhất</span>
          <strong>{providerState?.last_error_code ?? 'Không có'}</strong>
        </div>
      </section>

      <section className={styles.kpiGrid} aria-label="Thống kê đơn">
        <div className={styles.kpi}>
          <span>Chờ CK / Đã nhận tiền</span>
          <strong>{stats.pending} / {stats.paid}</strong>
        </div>
        <div className={styles.kpi}>
          <span>Đã cấp key</span>
          <strong>{stats.fulfilled}</strong>
        </div>
        <div className={styles.kpi}>
          <span>Doanh thu đã cấp (VND)</span>
          <strong>{stats.revenue.toLocaleString('vi-VN')}</strong>
        </div>
      </section>

      <section className={styles.card} aria-label="Danh sách đơn">
        <div className={styles.sectionHeader}>
          <h2>Đơn hàng ({filteredOrders.length}/{orders.length})</h2>
          <div className={styles.toolbar}>
            <label className={styles.searchField}>
              Tìm đơn
              <input
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setOrdersPage(1);
                }}
                placeholder="Mã CK, student, order..."
                aria-label="Tìm đơn mua key"
              />
            </label>
            <select value={statusFilter} onChange={(event) => {
              setStatusFilter(event.target.value);
              setOrdersPage(1);
            }} aria-label="Lọc đơn theo trạng thái">
              <option value="">Tất cả trạng thái</option>
              <option value="pending">Chờ chuyển khoản</option>
              <option value="paid">Đã nhận tiền</option>
              <option value="fulfilled">Đã cấp key</option>
              <option value="failed">Thất bại</option>
              <option value="refunded">Đã hoàn tiền</option>
            </select>
            <button
              className="btn secondary small"
              type="button"
              onClick={handleExport}
              disabled={filteredOrders.length === 0}
            >
              <Download size={15} aria-hidden="true" /> CSV
            </button>
            <button
              className={styles.iconButton}
              type="button"
              onClick={() => void load()}
              aria-label="Tải lại đơn"
            >
              <RefreshCw size={16} aria-hidden="true" />
            </button>
          </div>
        </div>
        {loading ? (
          <div className={styles.skeleton} role="status" aria-label="Đang tải đơn">
            <span /><span /><span />
          </div>
        ) : pagedOrders.length === 0 ? (
          <div className={styles.empty}>
            <Search className={styles.iconGlyph} size={20} aria-hidden="true" />
            {orders.length === 0 ? 'Chưa có đơn nào.' : 'Không có đơn nào khớp bộ lọc.'}
          </div>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <caption className={styles.srOnly}>Danh sách đơn mua key và trạng thái thanh toán</caption>
              <thead>
                <tr>
                  <th scope="col">Mã chuyển khoản</th>
                  <th scope="col">Học viên</th>
                  <th scope="col">Số tiền</th>
                  <th scope="col">Trạng thái</th>
                  <th scope="col">Mã đối soát</th>
                  <th scope="col">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {pagedOrders.map((order) => (
                  <tr key={order.id}>
                    <td>
                      <strong>{order.payment_code}</strong>
                      <small>{order.id}</small>
                    </td>
                    <td><small>{order.student_id}</small></td>
                    <td>{order.amount.toLocaleString('vi-VN')} {order.currency}</td>
                    <td>
                      <span className={styles.status} data-status={order.status}>
                        {purchaseStatusLabels[order.status] ?? order.status}
                      </span>
                    </td>
                    <td>{order.provider_order_ref ?? '—'}</td>
                    <td className={styles.rowActions}>
                      <button
                        type="button"
                        onClick={(event) => {
                          manualTriggerRef.current = event.currentTarget;
                          setManualOrder({ id: order.id, paymentCode: order.payment_code });
                        }}
                        disabled={order.status !== 'pending' || confirmingId === order.id}
                        title="Xác nhận đã nhận tiền (Zalo/thủ công) và cấp key"
                        aria-label={`Xác nhận thanh toán đơn ${order.payment_code}`}
                      >
                        <BadgeCheck size={15} aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        onClick={() => void reconcile(order.id)}
                        disabled={order.status !== 'paid'}
                        title="Retry fulfillment"
                        aria-label={`Đối soát đơn ${order.payment_code}`}
                      >
                        <RotateCcw size={15} aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          revokeTriggerRef.current = document.activeElement as HTMLButtonElement | null;
                          setRevokeReason('');
                          setRevokeId(order.id);
                        }}
                        disabled={order.status === 'refunded'}
                        title="Refund/revoke"
                        aria-label={`Revoke đơn ${order.payment_code}`}
                      >
                        <ShieldAlert size={15} aria-hidden="true" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {filteredOrders.length > 0 ? (
          <div className={styles.pagination}>
            <span>Trang {safeOrdersPage}/{ordersPageCount} · {filteredOrders.length} đơn</span>
            <div>
              <button type="button" onClick={() => setOrdersPage(safeOrdersPage - 1)} disabled={safeOrdersPage <= 1} aria-label="Trang trước">
                <ChevronLeft size={15} aria-hidden="true" />
              </button>
              <button type="button" onClick={() => setOrdersPage(safeOrdersPage + 1)} disabled={safeOrdersPage >= ordersPageCount} aria-label="Trang sau">
                <ChevronRight size={15} aria-hidden="true" />
              </button>
            </div>
          </div>
        ) : null}
      </section>

      <section className={styles.card} aria-label="Giao dịch lỗi">
        <h2>Giao dịch ThueAPIBank chưa khớp/lỗi ({events.length})</h2>
        {pagedEvents.length === 0 ? (
          <div className={`${styles.empty} ${styles.eventListSpaced}`}>
            <Inbox className={styles.iconGlyph} size={20} aria-hidden="true" />
            {!loading && events.length === 0 ? 'Không có event lỗi.' : 'Đang tải...'}
          </div>
        ) : (
          <div className={`${styles.eventList} ${styles.eventListSpaced}`}>
            {pagedEvents.map((event) => (
              <div className={styles.eventRow} key={event.id}>
                <strong>{event.event_type}</strong>
                <span>{event.provider_event_id}</span>
                <span>{event.processing_error}</span>
                <small>{event.order_id ?? 'Không tìm thấy mã đơn'}</small>
              </div>
            ))}
          </div>
        )}
        {events.length > 0 ? (
          <div className={styles.pagination}>
            <span>Trang {safeEventsPage}/{eventsPageCount}</span>
            <div>
              <button type="button" onClick={() => setEventsPage(safeEventsPage - 1)} disabled={safeEventsPage <= 1} aria-label="Trang trước">
                <ChevronLeft size={15} aria-hidden="true" />
              </button>
              <button type="button" onClick={() => setEventsPage(safeEventsPage + 1)} disabled={safeEventsPage >= eventsPageCount} aria-label="Trang sau">
                <ChevronRight size={15} aria-hidden="true" />
              </button>
            </div>
          </div>
        ) : null}
      </section>

      {manualOrder ? (
        <div
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="manual-confirm-title"
          aria-describedby="manual-confirm-desc"
          className={styles.dialogOverlay}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeManualDialog();
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault();
              closeManualDialog();
              return;
            }
            if (event.key !== 'Tab') return;
            const controls = Array.from(
              event.currentTarget.querySelectorAll<HTMLElement>(
                'button:not(:disabled), input:not(:disabled), [href], [tabindex]:not([tabindex="-1"])',
              ),
            );
            const first = controls[0];
            const last = controls[controls.length - 1];
            if (!first || !last) return;
            if (event.shiftKey && document.activeElement === first) {
              event.preventDefault();
              last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
              event.preventDefault();
              first.focus();
            }
          }}
        >
          <div className={`${styles.card} ${styles.dialog}`}>
            <h2 id="manual-confirm-title">Xác nhận đã nhận tiền?</h2>
            <p id="manual-confirm-desc" className={styles.hint}>
              Xác nhận đã nhận tiền Zalo/CK cho đơn <strong>{manualOrder.paymentCode}</strong>.
              Key sẽ được cấp ngay và không thể hoàn tác.
            </p>
            <div className={styles.dialogActions}>
              <button
                className="btn secondary small"
                type="button"
                onClick={closeManualDialog}
                disabled={confirmingId === manualOrder.id}
              >
                Hủy
              </button>
              <button
                ref={manualConfirmRef}
                className="btn small"
                type="button"
                onClick={() => void confirmManual(manualOrder.id)}
                disabled={confirmingId === manualOrder.id}
              >
                <BadgeCheck size={15} aria-hidden="true" />
                {confirmingId === manualOrder.id ? 'Đang cấp key...' : 'Xác nhận & cấp key'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {revokeId ? (
        <div
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="revoke-title"
          className={styles.dialogOverlay}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeRevokeDialog();
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault();
              closeRevokeDialog();
              return;
            }
            if (event.key !== 'Tab') return;
            const controls = Array.from(
              event.currentTarget.querySelectorAll<HTMLElement>(
                'button:not(:disabled), input:not(:disabled), [href], [tabindex]:not([tabindex="-1"])',
              ),
            );
            const first = controls[0];
            const last = controls[controls.length - 1];
            if (!first || !last) return;
            if (event.shiftKey && document.activeElement === first) {
              event.preventDefault();
              last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
              event.preventDefault();
              first.focus();
            }
          }}
        >
          <div className={`${styles.card} ${styles.dialog}`}>
            <h2 id="revoke-title">Refund / revoke đơn</h2>
            <p className={styles.hint}>Nhập lý do để lưu vết đối soát. Không thể hoàn tác.</p>
            <label className={styles.dialogLabel}>
              Lý do
              <input
                ref={revokeInputRef}
                value={revokeReason}
                onChange={(event) => setRevokeReason(event.target.value)}
                placeholder="VD: khách CK sai, hoàn tiền"
                onKeyDown={(event) => {
                  if (event.key === 'Enter') void revoke();
                }}
                className={styles.dialogInput}
              />
            </label>
            <div className={styles.dialogActions}>
              <button className="btn secondary small" type="button" onClick={closeRevokeDialog} disabled={revoking}>
                Hủy
              </button>
              <button className={`btn small ${styles.dangerButton}`} type="button" onClick={() => void revoke()} disabled={revoking}>
                {revoking ? 'Đang xử lý...' : 'Xác nhận revoke'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
