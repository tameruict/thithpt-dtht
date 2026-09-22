'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { Check, Copy, ExternalLink, Loader2, MessageCircle, RefreshCw, ShieldCheck } from 'lucide-react';
import { showToast } from '@/components/ui/Toast';
import { createPurchaseOrder } from './actions';
import { createClient } from '@/lib/supabase/client';
import { maskKey } from '@/lib/device';
import styles from '@/styles/purchase.module.css';
import StudentNav from '@/components/ui/StudentNav';

export type PurchaseProduct = {
  id: string;
  code: string;
  name: string;
  product_kind: 'bundle';
  attempt_count: number;
  price_amount: number;
  currency: string;
  valid_days: number | null;
};

export const PURCHASE_SCOPE_LABEL = 'Dùng cho tất cả phòng thi và tự luyện';

// Thanh toán tự động qua VietQR (buildVietQrUrl/qrUrl) đã bật: học viên quét QR để
// chuyển khoản đúng số tiền + nội dung, hệ thống tự cấp key qua webhook/đối soát.
// Zalo bên dưới chỉ là kênh hỗ trợ thủ công khi cần.
export const ZALO_LINK = 'https://zalo.me/0862370152';
export const ZALO_DISPLAY = 'zalo.me/0862370152';
export const ZALO_QR_URL =
  'https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=' +
  encodeURIComponent(ZALO_LINK);

const TERMINAL_ORDER_STATUSES = new Set(['fulfilled', 'failed', 'expired', 'revoked']);

export function purchaseOrderStatusLabel(status: string) {
  switch (status) {
    case 'pending': return 'Chờ chuyển khoản';
    case 'paid': return 'Đã nhận tiền';
    case 'fulfilled': return 'Đã cấp key';
    case 'expired': return 'Đã hết hạn';
    case 'failed': return 'Cần kiểm tra';
    case 'revoked': return 'Đã thu hồi';
    default: return status;
  }
}

export function purchaseErrorLabel(error: string) {
  const labels: Record<string, string> = {
    CHECKOUT_DISABLED: 'Kênh mua key đang tạm đóng.',
    CHECKOUT_CONFIGURATION_INVALID: 'Kênh thanh toán chưa sẵn sàng.',
    NOT_AUTHENTICATED: 'Vui lòng đăng nhập trước khi mua key.',
    PRODUCT_NOT_AVAILABLE: 'Gói này đã ngừng bán. Hãy chọn gói khác.',
    PRODUCT_LOOKUP_FAILED: 'Chưa tải được thông tin gói. Vui lòng thử lại.',
    PAYMENT_CURRENCY_UNSUPPORTED: 'Gói thanh toán phải sử dụng VND.',
    TRIAL_ALREADY_USED: 'Gói dùng thử chỉ mua 1 lần cho mỗi tài khoản.',
    COUPON_INVALID: 'Mã giảm giá không hợp lệ.',
    COUPON_NOT_FOUND: 'Không tìm thấy mã giảm giá.',
    COUPON_INACTIVE: 'Mã giảm giá đã bị tắt.',
    COUPON_NOT_STARTED: 'Mã giảm giá chưa tới thời gian áp dụng.',
    COUPON_EXPIRED: 'Mã giảm giá đã hết hạn.',
    COUPON_EXHAUSTED: 'Mã giảm giá đã hết lượt dùng.',
    COUPON_MIN_ORDER_NOT_MET: 'Đơn chưa đủ giá trị tối thiểu để dùng mã này.',
    COUPON_PER_USER_LIMIT: 'Bạn đã dùng mã này rồi.',
    COUPON_DISCOUNT_TOO_HIGH: 'Mã giảm giá vượt quá giá trị đơn.',
    TARGET_KEY_NOT_FOUND: 'Không tìm thấy key cần gia hạn.',
    TARGET_KEY_NOT_OWNED: 'Key gia hạn không thuộc tài khoản này.',
    TARGET_KEY_REVOKED: 'Key gia hạn đã bị thu hồi.',
    TARGET_KEY_INVALID: 'Key gia hạn không hợp lệ.',
  };
  return labels[error] ?? error;
}

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
  const router = useRouter();
  const [order, setOrder] = useState<OrderState | null>(null);
  const [selectedProduct, setSelectedProduct] = useState(products[0]?.id ?? '');
  const [coupon, setCoupon] = useState('');
  const [targetKeyCode, setTargetKeyCode] = useState('');

  // Prefill ?topup=BUY-... tu trang profile (khong dung useSearchParams de khoi can Suspense).
  useEffect(() => {
    try {
      const topup = new URLSearchParams(window.location.search).get('topup');
      if (topup) {
        // Defer the prefill update so the effect only bridges URL state into React.
        window.setTimeout(() => setTargetKeyCode(topup.toUpperCase()), 0);
      }
    } catch {
      // bo qua
    }
  }, []);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [copied, setCopied] = useState('');
  const [keyRevealed, setKeyRevealed] = useState(false);

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
        if (key?.code) {
          keyCode = key.code;
        } else {
          // Top-up: key cu, tra qua key_topups (cast any vi type gen chua co bang moi).
          // key_topups is newer than the generated Supabase schema; keep this
          // narrow escape hatch local to the optional top-up lookup.
          const { data: topup } = await (supabase as unknown as {
            from: (table: string) => {
              select: (columns: string) => {
                eq: (column: string, value: string) => {
                  maybeSingle: () => Promise<{ data: unknown }>;
                };
              };
            };
          }).from('key_topups')
            .select('key_id,exam_keys!inner(code)')
            .eq('order_id', order.orderId)
            .maybeSingle();
          const topupKey = topup as unknown as {
            exam_keys: { code: string } | { code: string }[];
          } | null;
          const topupCode = Array.isArray(topupKey?.exam_keys)
            ? topupKey?.exam_keys[0]?.code
            : topupKey?.exam_keys?.code;
          if (topupCode) keyCode = topupCode;
        }
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
    if (!order || TERMINAL_ORDER_STATUSES.has(order.status)) {
      return;
    }
    const interval = window.setInterval(() => {
      void refreshOrder();
    }, 4000);
    return () => window.clearInterval(interval);
  }, [order, refreshOrder]);

  // Realtime: react the instant the webhook flips the order (poll above is the
  // fallback the MBBank V4 docs recommend running alongside the webhook).
  useEffect(() => {
    if (!order || TERMINAL_ORDER_STATUSES.has(order.status)) return;
    const supabase = createClient();
    const channel = supabase
      .channel('order-' + order.orderId)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'purchase_orders',
          filter: 'id=eq.' + order.orderId,
        },
        () => {
          void refreshOrder();
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [order, refreshOrder]);

  // Live countdown to the 24h payment window so the pressure/urgency is clear.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!order || TERMINAL_ORDER_STATUSES.has(order.status) || !order.expiresAt) {
      return;
    }
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [order]);

  const countdown = useMemo(() => {
    if (!order?.expiresAt) return null;
    const remaining = new Date(order.expiresAt).getTime() - now;
    if (remaining <= 0) return '00:00';
    const totalSeconds = Math.floor(remaining / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    const pad = (n: number) => String(n).padStart(2, '0');
    return (hours > 0 ? pad(hours) + ':' : '') + pad(minutes) + ':' + pad(seconds);
  }, [order, now]);

  const copyValue = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      // Clipboard API có thể bị chặn (iframe/quyền): vẫn báo đã copy để không kẹt UI.
      showToast('Không truy cập được clipboard, hãy copy thủ công.', 'warning');
      return;
    }
    setCopied(label);
    window.setTimeout(() => setCopied(''), 1500);
  };

  const handleCreateOrder = async () => {
    if (!selected) return;
    setIsSubmitting(true);
    setFeedback('');
    setKeyRevealed(false);
    const idempotencyKey =
      typeof window !== 'undefined' && window.crypto?.randomUUID
        ? window.crypto.randomUUID()
        : 'order-' + Date.now() + '-' + Math.random().toString(36).slice(2);
    // Top-up: nhap ma key cu (VD BUY-...) de cong luot vao key do thay vi tao key moi.
    let targetKeyId: string | undefined;
    const trimmedTopup = targetKeyCode.trim().toUpperCase();
    if (trimmedTopup) {
      try {
        const supabase = createClient();
        const { data: found } = await supabase
          .from('exam_keys')
          .select('id')
          .eq('code', trimmedTopup)
          .maybeSingle();
        const foundId = (found as { id?: string } | null)?.id;
        if (!foundId) {
          setFeedback(purchaseErrorLabel('TARGET_KEY_NOT_FOUND'));
          setIsSubmitting(false);
          return;
        }
        targetKeyId = foundId;
      } catch {
        setFeedback('Không thể kiểm tra key gia hạn. Vui lòng thử lại.');
        setIsSubmitting(false);
        return;
      }
    }
    const couponCode = coupon.trim().toUpperCase() || undefined;
    try {
      const result = await createPurchaseOrder(selected.id, idempotencyKey, couponCode, targetKeyId);
      if (!result.ok) {
        if (result.error === 'NOT_AUTHENTICATED') {
          // A rotated/expired SSR cookie can race the browser session. Refresh
          // it once before asking the user to sign in again.
          const supabase = createClient();
          const { data: refreshed } = await supabase.auth.refreshSession();
          if (refreshed.session) {
            const retry = await createPurchaseOrder(selected.id, idempotencyKey, couponCode, targetKeyId);
            if (retry.ok) {
              if (retry.order.currency !== 'VND') {
                setFeedback(purchaseErrorLabel('PAYMENT_CURRENCY_UNSUPPORTED'));
                return;
              }
              setOrder({ ...retry.order, keyCode: null });
              showToast('Đã tạo đơn. Vui lòng chuyển khoản đúng nội dung.', 'success');
              return;
            }
            if (retry.error !== 'NOT_AUTHENTICATED') {
              setFeedback(purchaseErrorLabel(retry.error));
              return;
            }
          }

          router.push('/?redirect=%2Fpurchase', { transitionTypes: ['nav-back'] });
          return;
        }
        setFeedback(purchaseErrorLabel(result.error));
        return;
      }
      if (result.order.currency !== 'VND') {
        setFeedback(purchaseErrorLabel('PAYMENT_CURRENCY_UNSUPPORTED'));
        return;
      }
      setOrder({
        ...result.order,
        keyCode: null,
      });
      showToast('Đã tạo đơn. Vui lòng chuyển khoản đúng nội dung.', 'success');
    } catch {
      setFeedback('Không thể tạo đơn. Vui lòng thử lại.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // VietQR tu dong (mo lai) + Zalo fallback giu nguyen.
  const qrUrl = order && bankDetails ? buildVietQrUrl(bankDetails, order) : '';

  return (
    <main className={styles.page} id="main">
      <StudentNav />
      <div className={styles.header}>
        <div>
          <p className={styles.eyebrow}>THANH TOÁN KEY</p>
          <h1>Mua key luyện tập và thi</h1>
          <p>
            Mỗi key dùng chung số lượt cho thi chính thức và tự luyện, được cấp
            sau khi hệ thống xác nhận đúng giao dịch ThueAPIBank. Cần hỗ trợ
            nhanh? Nhắn Zalo bên dưới.
          </p>
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
          <section className={styles.card} aria-label="Chọn gói key">
            <h2>Chọn gói</h2>
            <div className={styles.products} role="radiogroup" aria-label="Danh sách gói key">
              {products.map((product, index) => (
                <button
                  type="button"
                  key={product.id}
                  role="radio"
                  aria-checked={selectedProduct === product.id}
                  id={'purchase-product-' + product.id}
                  tabIndex={
                    selectedProduct === product.id || (!selected && index === 0) ? 0 : -1
                  }
                  className={
                    styles.product +
                    (selectedProduct === product.id ? ' ' + styles.selected : '')
                  }
                  onClick={() => setSelectedProduct(product.id)}
                  onKeyDown={(event) => {
                    let dir = 0;
                    if (event.key === 'ArrowDown' || event.key === 'ArrowRight') dir = 1;
                    else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') dir = -1;
                    else return;
                    event.preventDefault();
                    const nextIndex = (index + dir + products.length) % products.length;
                    const nextProduct = products[nextIndex];
                    setSelectedProduct(nextProduct.id);
                    window.requestAnimationFrame(() =>
                      document.getElementById('purchase-product-' + nextProduct.id)?.focus(),
                    );
                  }}
                >
                  <span>
                    <strong>{product.name}</strong>
                    <small>
                      {product.attempt_count} lượt ·{' '}
                      {product.valid_days
                        ? 'hạn ' + product.valid_days + ' ngày'
                        : 'không giới hạn hạn dùng'}
                    </small>
                    <small>{PURCHASE_SCOPE_LABEL}</small>
                  </span>
                  <b>{product.price_amount.toLocaleString('vi-VN')} ₫</b>
                </button>
              ))}
            </div>
            {products.length === 0 ? (
              <p className={styles.muted}>Chưa có gói nào đang mở bán.</p>
            ) : null}
            <div className={styles.formRow}>
              <label className={styles.fieldLabel} htmlFor="purchase-coupon">
                Mã giảm giá (nếu có, VD: THPT30)
              </label>
              <input
                id="purchase-coupon"
                className={styles.textInput}
                value={coupon}
                onChange={(e) => setCoupon(e.target.value.toUpperCase())}
                placeholder="THPT30"
                autoComplete="off"
                spellCheck={false}
                maxLength={32}
              />
            </div>
            <div className={styles.formRow}>
              <label className={styles.fieldLabel} htmlFor="purchase-topup">
                Gia hạn key cũ (tùy chọn — nhập mã key VD: BUY-...)
              </label>
              <input
                id="purchase-topup"
                className={styles.textInput}
                value={targetKeyCode}
                onChange={(e) => setTargetKeyCode(e.target.value.toUpperCase())}
                placeholder="Để trống = cấp key mới"
                autoComplete="off"
                spellCheck={false}
              />
              <small className={styles.muted}>
                Nhập mã key đang dùng để cộng lượt + gia hạn vào key đó thay vì
                tạo key mới.
              </small>
            </div>
            {selected ? (
              <div className={styles.orderSummary} aria-live="polite">
                <div className={styles.summaryRow}>
                  <span>Gói đã chọn</span>
                  <strong>{selected.name}</strong>
                </div>
                <div className={styles.summaryRow}>
                  <span>Số lượt</span>
                  <strong>
                    {selected.attempt_count} lượt ·{' '}
                    {selected.valid_days
                      ? 'hạn ' + selected.valid_days + ' ngày'
                      : 'không giới hạn hạn dùng'}
                  </strong>
                </div>
                {coupon.trim() ? (
                  <div className={styles.summaryRow}>
                    <span>Mã giảm giá</span>
                    <strong>{coupon.trim()} — áp dụng khi tạo đơn</strong>
                  </div>
                ) : null}
                {targetKeyCode.trim() ? (
                  <div className={styles.summaryRow}>
                    <span>Gia hạn key</span>
                    <strong>{targetKeyCode.trim()}</strong>
                  </div>
                ) : null}
                <div className={styles.summaryRow + ' ' + styles.summaryTotal}>
                  <span>Tổng thanh toán</span>
                  <span className={styles.total}>
                    {selected.price_amount.toLocaleString('vi-VN')} ₫
                  </span>
                </div>
                {coupon.trim() ? (
                  <small className={styles.muted}>
                    Số tiền cuối cùng (sau giảm giá) sẽ hiển thị trên đơn ngay khi
                    tạo.
                  </small>
                ) : null}
              </div>
            ) : null}
            <button
              type="button"
              className={'btn ' + styles.submitBtn}
              onClick={handleCreateOrder}
              disabled={!selected || isSubmitting}
              aria-busy={isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <Loader2 size={16} className={styles.spinner} aria-hidden="true" />
                  Đang tạo đơn...
                </>
              ) : (
                'Tạo đơn chuyển khoản'
              )}
            </button>
            <div className={styles.zaloBox}>
              <p className={styles.muted}>
                Quét QR Zalo hoặc bấm nút bên dưới để nhắn tin mua key
                {selected
                  ? ' — nhớ báo tên gói đã chọn'
                  : ''}.
              </p>
              <div className={styles.zaloActions}>
                <a
                  className="btn"
                  href={ZALO_LINK}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <MessageCircle size={16} />
                  Liên hệ Zalo mua key
                </a>
                <button
                  type="button"
                  className="btn outline"
                  onClick={() => void copyValue(ZALO_LINK, 'zalo')}
                >
                  {copied === 'zalo' ? 'Đã copy link' : 'Copy link Zalo'}
                </button>
              </div>
            </div>
            {feedback ? <p className={styles.error} role="alert">{feedback}</p> : null}
          </section>

          {order ? (
            <section className={styles.card} aria-label="Thông tin đơn" aria-live="polite">
              <div className={styles.orderHeader}>
                <div>
                  <h2>{purchaseOrderStatusLabel(order.status)}</h2>
                  <small>{order.orderId}</small>
                </div>
                <button
                  type="button"
                  className={styles.refresh}
                  onClick={() => void refreshOrder()}
                  disabled={isRefreshing}
                  aria-label="Làm mới trạng thái đơn"
                >
                  <RefreshCw size={16} />
                </button>
              </div>
              {order.status === 'fulfilled' && order.keyCode ? (
                <div className={styles.success}>
                  <Check size={20} />
                  <div>
                    <strong>Đã cấp key</strong>
                    <code>{keyRevealed ? order.keyCode : maskKey(order.keyCode)}</code>
                    <div className={styles.zaloActions}>
                      <button
                        type="button"
                        onClick={() => setKeyRevealed((v) => !v)}
                      >
                        {keyRevealed ? 'Ẩn key' : 'Hiện key'}
                      </button>
                      <button
                        type="button"
                        onClick={() => void copyValue(order.keyCode!, 'key')}
                      >
                        {copied === 'key' ? 'Đã copy' : 'Copy key'}
                      </button>
                    </div>
                    <small className={styles.muted}>
                      Key gắn với tài khoản + thiết bị của bạn. Đừng chia sẻ.
                    </small>
                  </div>
                  <Link href="/subjects">Đi đến môn thi</Link>
                </div>
              ) : TERMINAL_ORDER_STATUSES.has(order.status) ? (
                <div className={styles.terminalOrder} role="status">
                  <ShieldCheck size={22} />
                  <div>
                    <strong>{purchaseOrderStatusLabel(order.status)}</strong>
                    <p>
                      Đơn không còn nhận thanh toán. Hãy tạo đơn mới và dùng đúng nội dung chuyển khoản.
                    </p>
                  </div>
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
                    Xác nhận tức thì khi nhận được tiền (webhook), đồng thời hệ
                    thống tự đối soát mỗi 4 giây. Chuyển đúng số tiền và giữ
                    nguyên nội dung thanh toán.
                  </p>
                  {countdown ? (
                    <p className={styles.expiry} aria-live="off">
                      Đơn còn hiệu lực: <strong>{countdown}</strong>
                    </p>
                  ) : null}
                  <button
                    type="button"
                    className="btn outline"
                    onClick={() => void refreshOrder()}
                    disabled={isRefreshing}
                  >
                    <RefreshCw size={16} />
                    {isRefreshing ? 'Đang kiểm tra...' : 'Đã chuyển, kiểm tra ngay'}
                  </button>
                  <div className={styles.zaloBox} style={{ marginTop: 16 }}>
                    <p className={styles.muted} style={{ margin: 0 }}>
                      Chuyển khoản khó? Quét QR Zalo hoặc nhắn tin để được hỗ
                      trợ mua key thủ công.
                    </p>
                    <div className={styles.zaloActions}>
                      <a
                        className="btn outline"
                        href={ZALO_LINK}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <MessageCircle size={16} />
                        Nhắn Zalo hỗ trợ
                      </a>
                      <button
                        type="button"
                        className="btn outline"
                        onClick={() => void copyValue(ZALO_LINK, 'zalo-qr')}
                      >
                        {copied === 'zalo-qr' ? 'Đã copy' : 'Copy link Zalo'}
                      </button>
                    </div>
                  </div>
                </>
              )}
            </section>
          ) : (
            <section className={styles.card + ' ' + styles.instructions}>
              <MessageCircle size={28} />
              <h2>Thanh toán tự động + hỗ trợ Zalo</h2>
              <p>
                Chọn gói, nhập mã giảm giá (nếu có), tạo đơn rồi quét QR chuyển
                khoản. Hệ thống chủ động đối soát ThueAPIBank. Cần hỗ trợ thủ
                công? Quét QR Zalo bên dưới.
              </p>
              <div className={styles.transfer} style={{ marginTop: 18 }}>
                <Image
                  src={ZALO_QR_URL}
                  alt="QR Zalo liên hệ mua key phòng thi"
                  width={220}
                  height={220}
                  unoptimized
                />
                <div className={styles.transferDetails}>
                  <InfoRow
                    label="Zalo"
                    value={ZALO_DISPLAY}
                    onCopy={() =>
                      void copyValue(ZALO_LINK, 'zalo-info')
                    }
                    copied={copied === 'zalo-info'}
                  />
                  <div className={styles.zaloActions}>
                    <a
                      className="btn"
                      href={ZALO_LINK}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <MessageCircle size={16} />
                      Mở Zalo
                    </a>
                    <a
                      className={styles.zaloLink}
                      href={ZALO_LINK}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {ZALO_LINK}
                      <ExternalLink size={14} />
                    </a>
                  </div>
                </div>
              </div>
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
