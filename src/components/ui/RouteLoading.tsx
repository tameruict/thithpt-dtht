import styles from './RouteLoading.module.css';

type RouteLoadingProps = {
  label?: string;
  /** Kiểu skeleton: page (mặc định) | card | table. Chỉ đổi mật độ skeleton, vẫn dùng tokens hiện có. */
  variant?: 'page' | 'card' | 'table';
  rows?: number;
};

export function RouteLoading({
  label = 'Đang tải nội dung…',
  variant = 'page',
  rows = 4,
}: RouteLoadingProps) {
  const skeletonRows = Math.min(Math.max(rows, 1), 8);

  return (
    <div id="main" tabIndex={-1} className={styles.wrap} role="status" aria-live="polite" aria-label={label}>
      <div
        className={styles.card}
        aria-hidden="true"
        // Table variant: khung rộng hơn để gợi ý bảng đang tải, không cần CSS mới.
        style={variant === 'table' ? { width: 'min(880px, 100%)' } : undefined}
      >
        <span className={styles.kicker} />
        <span className={styles.title} />
        {Array.from({ length: variant === 'card' ? 2 : skeletonRows }).map((_, index) => (
          <span key={index} className={index % 3 === 2 ? styles.shortLine : styles.line} />
        ))}
      </div>
      <p className={styles.label}>{label}</p>
    </div>
  );
}
