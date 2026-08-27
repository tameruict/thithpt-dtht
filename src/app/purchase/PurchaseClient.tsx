'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Check, Clipboard, Copy, RefreshCw } from 'lucide-react';
import { createPurchaseOrder } from './actions';
import { createClient } from '@/lib/supabase/client';
import styles from '@/styles/purchase.module.css';

export type PurchaseProduct = {
  id: string;
  code: string;
  name: string;
  product_kind: string;
  attempt_count: number;
  price_amount: number;
  currency: string;
  valid_days: number | null;
};

export type CheckoutBankDetails = {
  bankCode: string;
  bankAccount: string;
};

type OrderState = {
  orderId: string;
  paymentCode: string;
  amount: number;
  currency: string;
  status: string;
  expiresAt: string | null;
  keyCode: string | null;
};

export type PurchaseClientProps = {
  products: PurchaseProduct[];
  enabled: boolean;
  bankDetails: CheckoutBankDetails | null;
};

export function buildVietQrUrl(
  bankDetails: CheckoutBankDetails,
  order: Pick<OrderState, 'amount' | 'currency' | 'paymentCode'>,
) {
  if (order.currency !== 'VND') return '';

  const bankCode = bankDetails.bankCode.trim().toUpperCase();
  const bankAccount = bankDetails.bankAccount.replace(/\s+/g, '');
  const params = new URLSearchParams({
    amount: String(order.amount),
    addInfo: order.paymentCode,
  });

  return (
    'https://img.vietqr.io/image/' +
    encodeURIComponent(bankCode) +
    '-' +
    encodeURIComponent(bankAccount) +
    '-compact2.png?' +
    params.toString()
  );
}

export default function PurchaseClient({
  products,
  enabled,
  bankDetails,
}: PurchaseClientProps) {
  const [order, setOrder] = useState<OrderState | null>(null);
  const [selectedProduct, setSelectedProduct] = useState(products[0]?.id ?? '');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [copied, setCopied] = useState('');

  const selected = useMemo(
    () => products.find((product) => product.id === selectedProduct) ?? null,
    [products, selectedProduct],
  );

  const refreshOrder = useCallback(async () => {
    if (!order) return;
    setIsRefreshing(true);
    try {
      const supabase = createClient();
      const { data: latest } = await supabase
        .from('purchase_orders')
        .select('id,status,amount,currency,expires_at')
        .eq('id', order.orderId)
        .maybeSingle();
      if (!latest) return;

      let keyCode = order.keyCode;
      if (latest.status === 'fulfilled') {
        const { data: key } = await supabase
          .from('exam_keys')
          .select('code')
          .eq('source_order_id', order.orderId)
          .maybeSingle();
        keyCode = key?.code ?? keyCode;
      }

      setOrder((current) =>
        current
          ? {
              ...current,
              status: latest.status,
              amount: latest.amount,
              currency: latest.currency,
              expiresAt: latest.expires_at,
              keyCode,
            }
          : current,
      );
    } finally {
      setIsRefreshing(false);
    }
  }, [order]);

  useEffect(() => {
    if (!order || order.status === 'fulfilled' || order.status === 'failed') {
      return;
    }
    const interval = window.setInterval(() => {
      void refreshOrder();
    }, 4000);
    return () => window.clearInterval(interval);
  }, [order, refreshOrder]);

  const copyValue = async (value: string, label: string) => {
    await navigator.clipboard.writeText(value);
    setCopied(label);
    window.setTimeout(() => setCopied(''), 1500);
  };

  const handleCreateOrder = async () => {
    if (!selected) return;
    setIsSubmitting(true);
    setFeedback('');
    const idempotencyKey =
      typeof window !== 'undefined' && window.crypto?.randomUUID
        ? window.crypto.randomUUID()
        : 'order-' + Date.now() + '-' + Math.random().toString(36).slice(2);
    try {
      const result = await createPurchaseOrder(selected.id, idempotencyKey);
      if (!result.ok) {
        setFeedback(result.error);
        return;
      }
      if (result.order.currency !== 'VND') {
        setFeedback('PAYMENT_CURRENCY_UNSUPPORTED');
        return;
      }
      setOrder({
        ...result.order,
        keyCode: null,
      });
    } catch {
      setFeedback('Không thể tạo đơn. Vui lòng thử lại.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const qrUrl = order && bankDetails ? buildVietQrUrl(bankDetails, order) : '';

  return (
    <main className={styles.page}>
      <div className={styles.header}>
        <div>
          <p className={styles.eyebrow}>THANH TOÁN KEY</p>
          <h1>Mua key luyện tập và thi</h1>
          <p>Key được cấp sau khi hệ thống xác nhận đúng giao dịch ThueAPIBank.</p>
        </div>
        <div className={styles.links}>
          <Link href="/subjects">Môn thi</Link>
          <Link href="/profile">Hồ sơ</Link>
        </div>
      </div>

      {!enabled ? (
        <section className={styles.notice}>
          <h2>Thanh toán đang tạm đóng</h2>
          <p>Quản trị viên chưa bật cấu hình mua key.</p>
        </section>
      ) : (
        <div className={styles.grid}>
          <section className={styles.card}>
            <h2>Chọn gói</h2>
            <div className={styles.products}>
              {products.map((product) => (
                <button
                  type="button"
                  key={product.id}
                  className={
                    styles.product +
                    (selectedProduct === product.id ? ' ' + styles.selected : '')
                  }
                  onClick={() => setSelectedProduct(product.id)}
                >
                  <span>
                    <strong>{product.name}</strong>
                    <small>
                      {product.attempt_count} lượt ·{' '}
                      {product.valid_days
                        ? 'hạn ' + product.valid_days + ' ngày'
                        : 'không giới hạn hạn dùng'}
                    </small>
                  </span>
                  <b>{product.price_amount.toLocaleString('vi-VN')} ₫</b>
                </button>
              ))}
            </div>
            {products.length === 0 ? (
              <p className={styles.muted}>Chưa có gói nào đang mở bán.</p>
            ) : null}
            <button
              type="button"
              className="btn"
              onClick={handleCreateOrder}
              disabled={!selected || isSubmitting}
            >
              {isSubmitting ? 'Đang tạo đơn...' : 'Tạo đơn chuyển khoản'}
            </button>
            {feedback ? <p className={styles.error}>{feedback}</p> : null}
          </section>

          {order ? (
            <section className={styles.card}>
              <div className={styles.orderHeader}>
                <div>
                  <h2>Đơn {order.status}</h2>
                  <small>{order.orderId}</small>
                </div>
                <button
                  type="button"
                  className={styles.refresh}
                  onClick={() => void refreshOrder()}
                  disabled={isRefreshing}
                  aria-label="Làm mới trạng thái"
                >
                  <RefreshCw size={16} />
                </button>
              </div>
              {order.status === 'fulfilled' && order.keyCode ? (
                <div className={styles.success}>
                  <Check size={20} />
                  <div>
                    <strong>Đã cấp key</strong>
                    <code>{order.keyCode}</code>
                    <button
                      type="button"
                      onClick={() => void copyValue(order.keyCode!, 'key')}
                    >
                      {copied === 'key' ? 'Đã copy' : 'Copy key'}
                    </button>
                  </div>
                  <Link href="/subjects">Đi đến môn thi</Link>
                </div>
              ) : (
                <>
                  <div className={styles.transfer}>
                    {qrUrl ? (
                      <Image
                        src={qrUrl}
                        alt="QR chuyển khoản mua key"
                        width={220}
                        height={220}
                        unoptimized
                      />
                    ) : null}
                    <div className={styles.transferDetails}>
                      <InfoRow
                        label="Ngân hàng"
                        value={bankDetails?.bankCode ?? ''}
                      />
                      <InfoRow
                        label="Số tài khoản"
                        value={bankDetails?.bankAccount ?? ''}
                        onCopy={() =>
                          void copyValue(bankDetails?.bankAccount ?? '', 'account')
                        }
                        copied={copied === 'account'}
                      />
                      <InfoRow
                        label="Số tiền"
                        value={order.amount.toLocaleString('vi-VN') + ' ' + order.currency}
                        onCopy={() =>
                          void copyValue(String(order.amount), 'amount')
                        }
                        copied={copied === 'amount'}
                      />
                      <InfoRow
                        label="Nội dung"
                        value={order.paymentCode}
                        onCopy={() =>
                          void copyValue(order.paymentCode, 'content')
                        }
                        copied={copied === 'content'}
                      />
                    </div>
                  </div>
                  <p className={styles.pending}>
                    Hệ thống tự kiểm tra mỗi 4 giây. Chuyển đúng số tiền và giữ
                    nguyên nội dung thanh toán.
                  </p>
                </>
              )}
            </section>
          ) : (
            <section className={styles.card + ' ' + styles.instructions}>
              <Clipboard size={28} />
              <h2>Thanh toán tự động</h2>
              <p>
                Sau khi chuyển khoản, hệ thống chủ động đối soát ThueAPIBank.
                Đơn lặp hoặc giao dịch sai được lưu để quản trị viên xử lý.
              </p>
            </section>
          )}
        </div>
      )}
    </main>
  );
}

function InfoRow({
  label,
  value,
  onCopy,
  copied,
}: {
  label: string;
  value: string;
  onCopy?: () => void;
  copied?: boolean;
}) {
  return (
    <div className={styles.infoRow}>
      <span>{label}</span>
      <strong>{value || '—'}</strong>
      {onCopy ? (
        <button
          type="button"
          onClick={onCopy}
          aria-label={'Copy ' + label}
        >
          {copied ? <Check size={14} /> : <Copy size={14} />}
        </button>
      ) : null}
    </div>
  );
}
