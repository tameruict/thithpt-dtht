'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import {
  ArrowRight,
  BadgeCheck,
  Banknote,
  Check,
  Clock3,
  Copy,
  Crown,
  ExternalLink,
  Gift,
  KeyRound,
  Loader2,
  LockKeyhole,
  MessageCircle,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Zap,
} from 'lucide-react';
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

export const PURCHASE_SCOPE_LABEL =
  'Dùng chung cho tất cả phòng thi; khu tự luyện vẫn miễn phí';

// Gói "làm lại vĩnh viễn" được seed với attempt_count rất lớn (>= ngưỡng dưới) để
// biểu diễn "không giới hạn lượt". Hiển thị chữ thay vì con số 999999 khó hiểu.
export const UNLIMITED_ATTEMPT_THRESHOLD = 100000;

export function describePurchaseAttempts(attemptCount: number): string {
  if (attemptCount >= UNLIMITED_ATTEMPT_THRESHOLD) {
    return 'Không giới hạn lượt làm lại';
  }
  return attemptCount + ' lượt';
}

export function describePurchaseValidity(validDays: number | null): string {
  if (!validDays) return 'không giới hạn hạn dùng';
  if (validDays % 365 === 0) {
    const years = validDays / 365;
    return 'hạn ' + years + ' năm';
  }
  return 'hạn ' + validDays + ' ngày';
}

export function describePurchaseTerms(
  product: Pick<PurchaseProduct, 'attempt_count' | 'valid_days'>,
): string {
  return (
    describePurchaseAttempts(product.attempt_count) +
    ' · ' +
    describePurchaseValidity(product.valid_days)
  );
}

export function getRecommendedProductId(products: PurchaseProduct[]): string {
  const growthPlan = products.find((product) => product.code === 'BUNDLE-40');
  if (growthPlan) return growthPlan.id;

  const finitePlans = products.filter(
    (product) => product.attempt_count < UNLIMITED_ATTEMPT_THRESHOLD,
  );
  const candidates = finitePlans.length > 0 ? finitePlans : products;
  return candidates[Math.floor(candidates.length / 2)]?.id ?? '';
}

export function getSavingsPercent(
  product: PurchaseProduct,
  baseline: PurchaseProduct | null,
): number {
  if (
    !baseline ||
    product.attempt_count >= UNLIMITED_ATTEMPT_THRESHOLD ||
    baseline.attempt_count <= 0 ||
    product.attempt_count <= 0
  ) {
    return 0;
  }

  const baselinePerAttempt = baseline.price_amount / baseline.attempt_count;
  const productPerAttempt = product.price_amount / product.attempt_count;
  return Math.max(0, Math.round((1 - productPerAttempt / baselinePerAttempt) * 100));
}

function getProductDisplayName(product: PurchaseProduct): string {
  const names: Record<string, string> = {
    'TRIAL-3': 'Gói trải nghiệm',
    'BUNDLE-3': 'Gói linh hoạt',
    'BUNDLE-10': 'Gói Khởi động',
    'BUNDLE-30': 'Gói Bứt phá',
    'BUNDLE-40': 'Gói Tăng tốc',
    'VIP-1Y': 'Gói Chinh phục',
  };
  return names[product.code] ?? product.name;
}

function getProductKicker(product: PurchaseProduct): string {
  if (product.code === 'BUNDLE-10') return 'Học vừa đủ';
  if (product.code === 'BUNDLE-40') return 'Cân bằng nhất';
  if (product.attempt_count >= UNLIMITED_ATTEMPT_THRESHOLD) return 'Tự do luyện thi';
  return 'Linh hoạt theo nhu cầu';
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

export function formatPurchaseCountdown(
  expiresAt: string | null,
  now: number,
): string | null {
  if (!expiresAt) return null;
  const remaining = new Date(expiresAt).getTime() - now;
  if (remaining <= 0) return '00:00';
  const totalSeconds = Math.floor(remaining / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (value: number) => String(value).padStart(2, '0');
  return (hours > 0 ? pad(hours) + ':' : '') + pad(minutes) + ':' + pad(seconds);
}

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
    '-qr_only.png?' +
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
  const [selectedProduct, setSelectedProduct] = useState(
    () => getRecommendedProductId(products) || products[0]?.id || '',
  );
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
  const recommendedProductId = useMemo(
    () => getRecommendedProductId(products),
    [products],
  );
  const baselineProduct = useMemo(
    () => {
      const finitePlans = products.filter(
        (product) => product.attempt_count < UNLIMITED_ATTEMPT_THRESHOLD,
      );
      return (
        finitePlans.reduce<PurchaseProduct | null>((baseline, product) => {
          if (!baseline) return product;
          return product.price_amount / product.attempt_count >
            baseline.price_amount / baseline.attempt_count
            ? product
            : baseline;
        }, null) ?? null
      );
    },
    [products],
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

  // Live countdown to the 10-minute payment window.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!order || TERMINAL_ORDER_STATUSES.has(order.status) || !order.expiresAt) {
      return;
    }
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [order]);

  const countdown = useMemo(() => {
    return formatPurchaseCountdown(order?.expiresAt ?? null, now);
  }, [order?.expiresAt, now]);

  useEffect(() => {
    if (order?.status !== 'pending' || !order.expiresAt) return;

    const delay = Math.max(0, new Date(order.expiresAt).getTime() - Date.now());
    const timeout = window.setTimeout(() => {
      setOrder((current) => {
        if (
          !current ||
          current.status !== 'pending' ||
          current.expiresAt !== order.expiresAt
        ) {
          return current;
        }
        return { ...current, status: 'expired' };
      });
    }, delay);

    return () => window.clearTimeout(timeout);
  }, [order?.expiresAt, order?.status]);

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

      <section className={styles.hero} aria-labelledby="purchase-title">
        <div className={styles.heroGlow} aria-hidden="true" />
        <div className={styles.heroContent}>
          <div className={styles.eyebrow}>
            <Sparkles size={15} aria-hidden="true" />
            Tiếp sức cho chặng nước rút
          </div>
          <h1 id="purchase-title">
            Luyện nhiều hơn, <span>tự tin hơn</span> trong ngày thi
          </h1>
          <p>
            Bạn có 3 lượt thi miễn phí để bắt đầu. Khi cần luyện sâu hơn, hãy
            chọn một gói phù hợp để tiếp tục làm đề trên toàn hệ thống.
          </p>
          <div className={styles.heroActions}>
            <a className="btn large" href="#bang-gia">
              Xem các gói luyện thi
              <ArrowRight size={18} aria-hidden="true" />
            </a>
            <Link className={styles.secondaryLink} href="/subjects">
              Tiếp tục thi miễn phí
            </Link>
          </div>
          <ul className={styles.trustList} aria-label="Cam kết dịch vụ">
            <li><BadgeCheck size={17} aria-hidden="true" /> Giá hiển thị rõ ràng</li>
            <li><Zap size={17} aria-hidden="true" /> Cấp key tự động</li>
            <li><ShieldCheck size={17} aria-hidden="true" /> Thanh toán VietQR an toàn</li>
          </ul>
        </div>

        <aside className={styles.heroCard} aria-label="Quyền lợi khi mua gói">
          <div className={styles.heroCardIcon}><Crown size={26} aria-hidden="true" /></div>
          <p className={styles.heroCardLabel}>Mỗi gói đều bao gồm</p>
          <strong>Một key, dùng trọn hệ thống</strong>
          <ul>
            <li><Check size={16} aria-hidden="true" /> Làm đề ở mọi phòng thi</li>
            <li><Check size={16} aria-hidden="true" /> Cộng lượt vào key đang dùng</li>
            <li><Check size={16} aria-hidden="true" /> Theo dõi kết quả trong hồ sơ</li>
          </ul>
          <div className={styles.heroCardNote}>
            <LockKeyhole size={16} aria-hidden="true" />
            Key được bảo vệ theo tài khoản của bạn
          </div>
        </aside>
      </section>

      {!enabled ? (
        <section className={styles.notice}>
          <ShieldCheck size={24} aria-hidden="true" />
          <div>
            <h2>Thanh toán đang tạm đóng</h2>
            <p>Kênh thanh toán đang được bảo trì. Bạn vẫn có thể tiếp tục dùng lượt miễn phí.</p>
          </div>
          <Link className="btn outline" href="/subjects">Về trang môn thi</Link>
        </section>
      ) : (
        <>
          <section className={styles.pricingSection} id="bang-gia" aria-labelledby="pricing-title">
            <div className={styles.sectionHeading}>
              <div>
                <p className={styles.sectionEyebrow}>BƯỚC 1 · CHỌN GÓI PHÙ HỢP</p>
                <h2 id="pricing-title">Đầu tư vừa đủ cho mục tiêu của bạn</h2>
              </div>
              <p>
                Gói càng lớn, chi phí trên mỗi lượt càng tốt. Không tự động gia hạn,
                không có phí ẩn.
              </p>
            </div>

            {products.length > 0 ? (
              <div className={styles.products} role="radiogroup" aria-label="Danh sách gói luyện thi">
                {products.map((product, index) => {
                  const isRecommended = product.id === recommendedProductId;
                  const isUnlimited =
                    product.attempt_count >= UNLIMITED_ATTEMPT_THRESHOLD;
                  const savings = getSavingsPercent(product, baselineProduct);
                  const isSelected = selectedProduct === product.id;

                  return (
                    <button
                      type="button"
                      key={product.id}
                      role="radio"
                      aria-checked={isSelected}
                      id={'purchase-product-' + product.id}
                      tabIndex={isSelected || (!selected && index === 0) ? 0 : -1}
                      className={
                        styles.product +
                        (isRecommended ? ' ' + styles.featured : '') +
                        (isSelected ? ' ' + styles.selected : '')
                      }
                      onClick={() => setSelectedProduct(product.id)}
                      onKeyDown={(event) => {
                        let direction = 0;
                        if (event.key === 'ArrowDown' || event.key === 'ArrowRight') direction = 1;
                        else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') direction = -1;
                        else return;
                        event.preventDefault();
                        const nextIndex = (index + direction + products.length) % products.length;
                        const nextProduct = products[nextIndex];
                        setSelectedProduct(nextProduct.id);
                        window.requestAnimationFrame(() =>
                          document.getElementById('purchase-product-' + nextProduct.id)?.focus(),
                        );
                      }}
                    >
                      {isRecommended ? (
                        <span className={styles.recommendedBadge}>
                          <Zap size={13} aria-hidden="true" /> Được chọn nhiều
                        </span>
                      ) : null}
                      <span className={styles.planKicker}>{getProductKicker(product)}</span>
                      <strong className={styles.planName}>{getProductDisplayName(product)}</strong>
                      <span className={styles.priceLine}>
                        <b>{product.price_amount.toLocaleString('vi-VN')} ₫</b>
                        <small>/ gói</small>
                      </span>
                      <span className={styles.planDivider} aria-hidden="true" />
                      <span className={styles.planFeature}>
                        <KeyRound size={17} aria-hidden="true" />
                        {describePurchaseAttempts(product.attempt_count)}
                      </span>
                      <span className={styles.planFeature}>
                        <Clock3 size={17} aria-hidden="true" />
                        {describePurchaseValidity(product.valid_days)}
                      </span>
                      <span className={styles.planFeature}>
                        <BadgeCheck size={17} aria-hidden="true" />
                        Toàn bộ phòng thi
                      </span>
                      <span className={styles.planValue}>
                        {isUnlimited
                          ? 'Không còn áp lực hết lượt'
                          : savings > 0
                            ? `Tiết kiệm ${savings}% mỗi lượt`
                            : 'Bắt đầu nhẹ nhàng'}
                      </span>
                      <span className={styles.selectIndicator}>
                        {isSelected ? <Check size={17} aria-hidden="true" /> : null}
                        {isSelected ? 'Đã chọn' : 'Chọn gói này'}
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className={styles.emptyState}>
                <Gift size={26} aria-hidden="true" />
                <strong>Chưa có gói nào đang mở bán</strong>
                <span>Vui lòng quay lại sau hoặc liên hệ Zalo để được hỗ trợ.</span>
              </div>
            )}
          </section>

          <div className={styles.checkoutGrid}>
            <section className={styles.checkoutCard} aria-labelledby="checkout-title">
              <div className={styles.checkoutHeading}>
                <span className={styles.stepNumber}>2</span>
                <div>
                  <p>Hoàn tất lựa chọn</p>
                  <h2 id="checkout-title">Tạo đơn thanh toán</h2>
                </div>
              </div>

              <div className={styles.formGrid}>
                <div className={styles.formRow}>
                  <label className={styles.fieldLabel} htmlFor="purchase-coupon">
                    Mã ưu đãi <span>(nếu có)</span>
                  </label>
                  <input
                    id="purchase-coupon"
                    className={styles.textInput}
                    value={coupon}
                    onChange={(event) => setCoupon(event.target.value.toUpperCase())}
                    placeholder="Ví dụ: THPT30"
                    autoComplete="off"
                    spellCheck={false}
                    maxLength={32}
                  />
                </div>
                <div className={styles.formRow}>
                  <label className={styles.fieldLabel} htmlFor="purchase-topup">
                    Cộng vào key cũ <span>(tùy chọn)</span>
                  </label>
                  <input
                    id="purchase-topup"
                    className={styles.textInput}
                    value={targetKeyCode}
                    onChange={(event) => setTargetKeyCode(event.target.value.toUpperCase())}
                    placeholder="Ví dụ: BUY-XXXX"
                    autoComplete="off"
                    spellCheck={false}
                    maxLength={64}
                  />
                  <small className={styles.fieldHint}>Bỏ trống nếu bạn muốn nhận key mới.</small>
                </div>
              </div>

              {selected ? (
                <div className={styles.orderSummary} aria-live="polite">
                  <div className={styles.summaryPlan}>
                    <div>
                      <span>Gói đã chọn</span>
                      <strong>{getProductDisplayName(selected)}</strong>
                    </div>
                    <button type="button" onClick={() => document.getElementById('bang-gia')?.scrollIntoView()}>
                      Đổi gói
                    </button>
                  </div>
                  <div className={styles.summaryRow}>
                    <span>Quyền lợi</span>
                    <strong>{describePurchaseTerms(selected)}</strong>
                  </div>
                  {coupon.trim() ? (
                    <div className={styles.summaryRow}>
                      <span>Mã ưu đãi</span>
                      <strong>{coupon.trim()} · kiểm tra khi tạo đơn</strong>
                    </div>
                  ) : null}
                  {targetKeyCode.trim() ? (
                    <div className={styles.summaryRow}>
                      <span>Key được cộng lượt</span>
                      <strong>{targetKeyCode.trim()}</strong>
                    </div>
                  ) : null}
                  <div className={styles.summaryRow + ' ' + styles.summaryTotal}>
                    <span>Tạm tính</span>
                    <span className={styles.total}>{selected.price_amount.toLocaleString('vi-VN')} ₫</span>
                  </div>
                  {coupon.trim() ? (
                    <small className={styles.summaryNote}>
                      Giá sau ưu đãi sẽ được xác nhận trước khi bạn chuyển khoản.
                    </small>
                  ) : null}
                </div>
              ) : null}

              <button
                type="button"
                className={'btn large ' + styles.submitBtn}
                onClick={handleCreateOrder}
                disabled={!selected || isSubmitting}
                aria-busy={isSubmitting}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 size={18} className={styles.spinner} aria-hidden="true" />
                    Đang tạo đơn…
                  </>
                ) : (
                  <>
                    Tạo đơn và nhận mã QR
                    <ArrowRight size={18} aria-hidden="true" />
                  </>
                )}
              </button>
              <p className={styles.checkoutAssurance}>
                <LockKeyhole size={15} aria-hidden="true" />
                Bạn chỉ chuyển khoản sau khi kiểm tra đúng số tiền và nội dung đơn.
              </p>
              {feedback ? <p className={styles.error} role="alert">{feedback}</p> : null}
            </section>

            {order ? (
              <section className={styles.paymentCard} aria-label="Thông tin đơn" aria-live="polite">
                <div className={styles.orderHeader}>
                  <div>
                    <p className={styles.sectionEyebrow}>TRẠNG THÁI ĐƠN</p>
                    <h2>{purchaseOrderStatusLabel(order.status)}</h2>
                    <small>Mã đơn: {order.orderId}</small>
                  </div>
                  <button
                    type="button"
                    className={styles.refresh}
                    onClick={() => void refreshOrder()}
                    disabled={isRefreshing}
                    aria-label="Làm mới trạng thái đơn"
                  >
                    <RefreshCw
                      size={17}
                      className={isRefreshing ? styles.spinner : undefined}
                      aria-hidden="true"
                    />
                  </button>
                </div>

                {order.status === 'fulfilled' && order.keyCode ? (
                  <div className={styles.success}>
                    <div className={styles.successIcon}><Check size={22} aria-hidden="true" /></div>
                    <div>
                      <strong>Key của bạn đã sẵn sàng</strong>
                      <code>{keyRevealed ? order.keyCode : maskKey(order.keyCode)}</code>
                      <div className={styles.inlineActions}>
                        <button type="button" onClick={() => setKeyRevealed((value) => !value)}>
                          {keyRevealed ? 'Ẩn key' : 'Hiện key'}
                        </button>
                        <button type="button" onClick={() => void copyValue(order.keyCode!, 'key')}>
                          {copied === 'key' ? 'Đã sao chép' : 'Sao chép key'}
                        </button>
                      </div>
                      <small>Key được bảo vệ theo tài khoản của bạn. Không chia sẻ cho người khác.</small>
                      <Link className="btn" href="/subjects">Bắt đầu làm đề</Link>
                    </div>
                  </div>
                ) : TERMINAL_ORDER_STATUSES.has(order.status) ? (
                  <div className={styles.terminalOrder} role="status">
                    <ShieldCheck size={22} aria-hidden="true" />
                    <div>
                      <strong>{purchaseOrderStatusLabel(order.status)}</strong>
                      <p>Đơn không còn nhận thanh toán. Hãy tạo đơn mới để nhận nội dung chuyển khoản mới.</p>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className={styles.transfer}>
                      {qrUrl ? (
                        <div className={styles.qrFrame}>
                          <Image
                            src={qrUrl}
                            alt="Mã QR chuyển khoản mua gói luyện thi"
                            width={220}
                            height={220}
                            unoptimized
                          />
                          <span>Quét bằng ứng dụng ngân hàng</span>
                        </div>
                      ) : null}
                      <div className={styles.transferDetails}>
                        <InfoRow label="Ngân hàng" value={bankDetails?.bankCode ?? ''} />
                        <InfoRow
                          label="Số tài khoản"
                          value={bankDetails?.bankAccount ?? ''}
                          onCopy={() => void copyValue(bankDetails?.bankAccount ?? '', 'account')}
                          copied={copied === 'account'}
                        />
                        <InfoRow
                          label="Số tiền"
                          value={order.amount.toLocaleString('vi-VN') + ' ' + order.currency}
                          onCopy={() => void copyValue(String(order.amount), 'amount')}
                          copied={copied === 'amount'}
                        />
                        <InfoRow
                          label="Nội dung"
                          value={order.paymentCode}
                          onCopy={() => void copyValue(order.paymentCode, 'content')}
                          copied={copied === 'content'}
                        />
                        {countdown ? (
                          <div className={styles.expiry} aria-live="off">
                            <Clock3 size={16} aria-hidden="true" />
                            Đơn còn hiệu lực <strong>{countdown}</strong>
                          </div>
                        ) : null}
                      </div>
                    </div>
                    <div className={styles.paymentNotice}>
                      <Zap size={18} aria-hidden="true" />
                      <p>
                        <strong>Tự động xác nhận sau khi nhận tiền.</strong>
                        Chuyển đúng số tiền và giữ nguyên nội dung để key được cấp nhanh nhất.
                      </p>
                    </div>
                    <button
                      type="button"
                      className="btn outline"
                      onClick={() => void refreshOrder()}
                      disabled={isRefreshing}
                    >
                      <RefreshCw size={16} aria-hidden="true" />
                      {isRefreshing ? 'Đang kiểm tra…' : 'Tôi đã chuyển khoản, kiểm tra ngay'}
                    </button>
                  </>
                )}
              </section>
            ) : (
              <aside className={styles.guideCard} aria-labelledby="guide-title">
                <div className={styles.checkoutHeading}>
                  <span className={styles.stepNumber}>3</span>
                  <div>
                    <p>Nhanh và minh bạch</p>
                    <h2 id="guide-title">Nhận key chỉ trong 3 bước</h2>
                  </div>
                </div>
                <ol className={styles.steps}>
                  <li>
                    <span><KeyRound size={18} aria-hidden="true" /></span>
                    <div><strong>Chọn gói phù hợp</strong><p>Ưu tiên theo số lượt và thời gian ôn thi còn lại.</p></div>
                  </li>
                  <li>
                    <span><Banknote size={18} aria-hidden="true" /></span>
                    <div><strong>Quét VietQR</strong><p>Đúng số tiền, đúng nội dung đã tạo cho riêng đơn của bạn.</p></div>
                  </li>
                  <li>
                    <span><Zap size={18} aria-hidden="true" /></span>
                    <div><strong>Nhận key tự động</strong><p>Hệ thống đối soát và hiển thị key ngay trên trang này.</p></div>
                  </li>
                </ol>
                <div className={styles.supportBox}>
                  <div>
                    <MessageCircle size={20} aria-hidden="true" />
                    <div><strong>Cần tư vấn chọn gói?</strong><p>Nhắn Zalo, đội ngũ hỗ trợ sẽ phản hồi sớm.</p></div>
                  </div>
                  <a href={ZALO_LINK} target="_blank" rel="noopener noreferrer">
                    Mở Zalo <ExternalLink size={14} aria-hidden="true" />
                  </a>
                </div>
              </aside>
            )}
          </div>

          <section className={styles.bottomTrust} aria-label="Thông tin hỗ trợ thanh toán">
            <div><ShieldCheck size={22} aria-hidden="true" /><span><strong>Thanh toán có đối soát</strong>Chỉ cấp key khi giao dịch khớp đơn.</span></div>
            <div><Gift size={22} aria-hidden="true" /><span><strong>Không phí ẩn</strong>Thanh toán đúng giá hiển thị trên đơn.</span></div>
            <div><MessageCircle size={22} aria-hidden="true" /><span><strong>Hỗ trợ khi cần</strong><a href={ZALO_LINK} target="_blank" rel="noopener noreferrer">{ZALO_DISPLAY}</a></span></div>
          </section>
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
          aria-label={'Sao chép ' + label.toLocaleLowerCase('vi-VN')}
        >
          {copied ? (
            <Check size={14} aria-hidden="true" />
          ) : (
            <Copy size={14} aria-hidden="true" />
          )}
        </button>
      ) : null}
    </div>
  );
}
