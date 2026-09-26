'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { Check, Copy, ExternalLink, Loader2, MessageCircle, Minus, RefreshCw, ShieldCheck } from 'lucide-react';
import { showToast } from '@/components/ui/Toast';
import { createPurchaseOrder } from './actions';
import { createClient } from '@/lib/supabase/client';
import { formatPriceVnd } from '@/lib/supabase/exam-data';
import { formatHanoiDate } from '@/lib/datetime';
import styles from '@/styles/purchase.module.css';
import StudentNav from '@/components/ui/StudentNav';

export type PurchaseProduct = {
  id: string;
  code: string;
  name: string;
  product_kind: 'subscription';
  price_amount: number;
  currency: string;
  // Cột DB có giá trị dummy (999999, "không giới hạn lượt") cho gói subscription
  // — không còn ý nghĩa nghiệp vụ, KHÔNG hiển thị ra UI.
  valid_days: number | null;
};

export type CurrentAccess = {
  is_vip: boolean;
  plan_code: string | null;
  expires_at: string | null;
};

export const PURCHASE_SCOPE_LABEL = 'Dùng cho tất cả phòng thi và tự luyện';

export function describePurchaseValidity(validDays: number | null): string {
  if (!validDays) return 'không giới hạn hạn dùng';
  if (validDays % 365 === 0) {
    const years = validDays / 365;
    return 'hạn ' + years + ' năm';
  }
  if (validDays % 7 === 0 && validDays < 30) {
    return 'hạn ' + validDays / 7 + ' tuần';
  }
  return 'hạn ' + validDays + ' ngày';
}

/** Giá quy đổi theo ngày, dùng để so sánh giá trị giữa các gói (đồng/ngày). */
export function getPricePerDay(
  product: Pick<PurchaseProduct, 'price_amount' | 'valid_days'>,
): number | null {
  if (!product.valid_days || product.valid_days <= 0) return null;
  return product.price_amount / product.valid_days;
}

export function formatPricePerDay(
  product: Pick<PurchaseProduct, 'price_amount' | 'valid_days'>,
): string {
  const perDay = getPricePerDay(product);
  if (perDay == null) return '';
  return '~' + Math.round(perDay).toLocaleString('vi-VN') + 'đ/ngày';
}

/** Gói tháng là "phổ biến nhất" theo mặc định; nếu bảng giá đổi tên/mã, rơi về gói ở giữa. */
export function getPopularProductId(products: PurchaseProduct[]): string | null {
  const monthly = products.find((product) => product.code === 'VIP-MONTH');
  if (monthly) return monthly.id;
  if (products.length === 0) return null;
  const sorted = [...products].sort((a, b) => a.price_amount - b.price_amount);
  return sorted[Math.floor(sorted.length / 2)]?.id ?? null;
}

/** "Tiết kiệm nhất" = giá/ngày thấp nhất trong các gói đang mở bán. */
export function getBestValueProductId(products: PurchaseProduct[]): string | null {
  let bestId: string | null = null;
  let bestPerDay = Infinity;
  for (const product of products) {
    const perDay = getPricePerDay(product);
    if (perDay != null && perDay < bestPerDay) {
      bestPerDay = perDay;
      bestId = product.id;
    }
  }
  return bestId;
}

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
    case 'fulfilled': return 'Đã kích hoạt VIP';
    case 'expired': return 'Đã hết hạn';
    case 'failed': return 'Cần kiểm tra';
    case 'revoked': return 'Đã thu hồi';
    default: return status;
  }
}

export function purchaseErrorLabel(error: string) {
  const labels: Record<string, string> = {
    CHECKOUT_DISABLED: 'Kênh mua VIP đang tạm đóng.',
    CHECKOUT_CONFIGURATION_INVALID: 'Kênh thanh toán chưa sẵn sàng.',
    NOT_AUTHENTICATED: 'Vui lòng đăng nhập trước khi mua VIP.',
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
};

export type PurchaseClientProps = {
  products: PurchaseProduct[];
  enabled: boolean;
  bankDetails: CheckoutBankDetails | null;
  currentAccess: CurrentAccess | null;
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
    '-qr_only.png?' +
    params.toString()
  );
}

type FeatureValue = true | false | string;

const FEATURE_ROWS: Array<{ label: string; free: FeatureValue; vip: FeatureValue }> = [
  { label: 'Xem danh sách đề thi', free: true, vip: true },
  { label: 'Làm đề miễn phí (3 đề/môn)', free: true, vip: true },
  { label: 'Làm toàn bộ đề trong kho', free: false, vip: true },
  { label: 'Chấm điểm tự động', free: true, vip: true },
  { label: 'Xem lời giải chi tiết', free: 'Giới hạn', vip: 'Đầy đủ' },
  { label: 'Làm lại không giới hạn', free: false, vip: true },
];

function FeatureCell({ value }: { value: FeatureValue }) {
  if (typeof value === 'string') return <span>{value}</span>;
  return value ? (
    <Check size={16} className={styles.featureYes} aria-label="Có" />
  ) : (
    <Minus size={16} className={styles.featureNo} aria-label="Không" />
  );
}

function FeatureComparisonTable() {
  return (
    <section className={styles.compareCard} aria-label="So sánh Free và VIP">
      <h2>Free vs VIP — bạn được gì thêm?</h2>
      <div className={styles.compareTable} role="table">
        <div className={styles.compareRow + ' ' + styles.compareHead} role="row">
          <span role="columnheader">Tính năng</span>
          <span role="columnheader">Free</span>
          <span role="columnheader">VIP</span>
        </div>
        {FEATURE_ROWS.map((row) => (
          <div className={styles.compareRow} role="row" key={row.label}>
            <span role="cell">{row.label}</span>
            <span role="cell" className={styles.compareCell}>
              <FeatureCell value={row.free} />
            </span>
            <span role="cell" className={styles.compareCell + ' ' + styles.compareCellVip}>
              <FeatureCell value={row.vip} />
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

export default function PurchaseClient({
  products,
  enabled,
  bankDetails,
  currentAccess,
}: PurchaseClientProps) {
  const router = useRouter();
  const [order, setOrder] = useState<OrderState | null>(null);
  const [selectedProduct, setSelectedProduct] = useState(products[0]?.id ?? '');
  const [coupon, setCoupon] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [copied, setCopied] = useState('');
  const [access, setAccess] = useState<CurrentAccess | null>(currentAccess);

  const selected = useMemo(
    () => products.find((product) => product.id === selectedProduct) ?? null,
    [products, selectedProduct],
  );

  const popularId = useMemo(() => getPopularProductId(products), [products]);
  const bestValueId = useMemo(() => getBestValueProductId(products), [products]);

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

      setOrder((current) =>
        current
          ? {
              ...current,
              status: latest.status,
              amount: latest.amount,
              currency: latest.currency,
              expiresAt: latest.expires_at,
            }
          : current,
      );

      if (latest.status === 'fulfilled') {
        // Gói VIP được cấp qua entitlements (không sinh exam_key) — đọc lại
        // hạn VIP mới nhất để hiện đúng ngày hết hạn sau khi cộng dồn.
        const { data: latestAccess } = await supabase.rpc('get_user_access');
        if (latestAccess && typeof latestAccess === 'object') {
          setAccess(latestAccess as CurrentAccess);
        }
      }
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
    const idempotencyKey =
      typeof window !== 'undefined' && window.crypto?.randomUUID
        ? window.crypto.randomUUID()
        : 'order-' + Date.now() + '-' + Math.random().toString(36).slice(2);
    const couponCode = coupon.trim().toUpperCase() || undefined;
    // Gói VIP theo thời gian không gắn với 1 key cụ thể (khác cơ chế top-up key
    // cũ) — luôn truyền undefined, cộng dồn hạn VIP được xử lý ở backend.
    const targetKeyId = undefined;
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
              setOrder(retry.order);
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
      setOrder(result.order);
      showToast('Đã tạo đơn. Vui lòng chuyển khoản đúng nội dung.', 'success');
    } catch {
      setFeedback('Không thể tạo đơn. Vui lòng thử lại.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // VietQR tu dong (mo lai) + Zalo fallback giu nguyen.
  const qrUrl = order && bankDetails ? buildVietQrUrl(bankDetails, order) : '';
  const submitLabel = access?.is_vip ? 'Gia hạn thêm' : 'Mua ngay';

  return (
    <main className={styles.page} id="main">
      <StudentNav />
      <div className={styles.header}>
        <div>
          <p className={styles.eyebrow}>GÓI VIP</p>
          <h1>Mở khóa toàn bộ kho đề thi THPT 2026</h1>
          <p>
            Chọn gói VIP theo thời gian phù hợp, thanh toán tự động qua QR
            ngân hàng — hệ thống kích hoạt ngay khi xác nhận đúng giao dịch
            ThueAPIBank. Cần hỗ trợ nhanh? Nhắn Zalo bên dưới.
          </p>
        </div>
        <div className={styles.links}>
          <Link href="/subjects">Môn thi</Link>
          <Link href="/profile">Hồ sơ</Link>
        </div>
      </div>

      {access?.is_vip ? (
        <section className={styles.vipBanner} role="status">
          <ShieldCheck size={20} />
          <div>
            <strong>
              Bạn đang là VIP{access.plan_code ? ' (gói ' + access.plan_code + ')' : ''}
            </strong>
            <p>
              Hết hạn ngày <strong>{formatHanoiDate(access.expires_at)}</strong>.
              Mua thêm gói bên dưới để gia hạn — thời gian được cộng dồn vào
              hạn hiện tại.
            </p>
          </div>
        </section>
      ) : null}

      {!enabled ? (
        <section className={styles.notice}>
          <h2>Thanh toán đang tạm đóng</h2>
          <p>Quản trị viên chưa bật cấu hình mua VIP.</p>
        </section>
      ) : (
        <>
          <div className={styles.grid}>
            <section className={styles.card} aria-label="Chọn gói VIP">
              <h2>Chọn gói VIP</h2>
              <div className={styles.products} role="radiogroup" aria-label="Danh sách gói VIP">
                {products.map((product, index) => {
                  const isPopular = product.id === popularId;
                  const isBestValue = product.id === bestValueId;
                  const perDay = formatPricePerDay(product);
                  return (
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
                        ((isPopular || isBestValue) ? ' ' + styles.featured : '') +
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
                        <strong>
                          {product.name}
                          {isPopular ? (
                            <span className={styles.badge}>Phổ biến nhất</span>
                          ) : null}
                          {isBestValue ? (
                            <span className={styles.badge}>Tiết kiệm nhất</span>
                          ) : null}
                        </strong>
                        <small>{describePurchaseValidity(product.valid_days)}</small>
                        {perDay ? <small>Chỉ {perDay}</small> : null}
                        <small>{PURCHASE_SCOPE_LABEL}</small>
                      </span>
                      <b>{formatPriceVnd(product.price_amount)}</b>
                    </button>
                  );
                })}
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
              {selected ? (
                <div className={styles.orderSummary} aria-live="polite">
                  <div className={styles.summaryRow}>
                    <span>Gói đã chọn</span>
                    <strong>{selected.name}</strong>
                  </div>
                  <div className={styles.summaryRow}>
                    <span>Thời hạn</span>
                    <strong>{describePurchaseValidity(selected.valid_days)}</strong>
                  </div>
                  {coupon.trim() ? (
                    <div className={styles.summaryRow}>
                      <span>Mã giảm giá</span>
                      <strong>{coupon.trim()} — áp dụng khi tạo đơn</strong>
                    </div>
                  ) : null}
                  <div className={styles.summaryRow + ' ' + styles.summaryTotal}>
                    <span>Tổng thanh toán</span>
                    <span className={styles.total}>
                      {formatPriceVnd(selected.price_amount)}
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
                  submitLabel
                )}
              </button>
              <div className={styles.zaloBox}>
                <p className={styles.muted}>
                  Quét QR Zalo hoặc bấm nút bên dưới để nhắn tin mua VIP
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
                    Liên hệ Zalo mua VIP
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
                {order.status === 'fulfilled' ? (
                  <div className={styles.success}>
                    <Check size={20} />
                    <div>
                      <strong>Đã kích hoạt VIP</strong>
                      <p className={styles.muted} style={{ margin: 0 }}>
                        Hết hạn ngày <strong>{formatHanoiDate(access?.expires_at ?? null)}</strong>.
                        Vào ngay để làm bài không giới hạn.
                      </p>
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
                          alt="QR chuyển khoản mua VIP"
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
                        trợ mua VIP thủ công.
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
                    alt="QR Zalo liên hệ mua VIP phòng thi"
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

          <FeatureComparisonTable />
        </>
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
