'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { AlertTriangle, House, RotateCcw } from 'lucide-react';

type AppErrorProps = {
  error: Error & { digest?: string };
  /** Next 16.3+: `retry`. Giữ `reset` để tương thích boundary cũ. */
  reset?: () => void;
  retry?: () => void;
};

/**
 * Error boundary dùng chung (theo docs `error.js` Next 16).
 * Client Component, nhận `retry` (mới) / `reset` (cũ), chỉ đổi presentation.
 */
export default function AppError({ error, reset, retry }: AppErrorProps) {
  useEffect(() => {
    console.error('[app-error]', error.digest ?? error.message);
  }, [error]);

  const recover = retry ?? reset;

  return (
    <main
      id="main"
      tabIndex={-1}
      className="route-error"
      role="alert"
      aria-live="assertive"
      style={{ padding: 'calc(32px + env(safe-area-inset-top, 0px)) var(--page-gutter) 48px' }}
    >
      <div
        className="card"
        style={{
          width: 'min(560px, 100%)',
          padding: 'clamp(22px, 4vw, 34px)',
          display: 'grid',
          gap: 12,
          justifyItems: 'center',
          textAlign: 'center',
        }}
      >
        <span
          aria-hidden="true"
          style={{
            width: 48,
            height: 48,
            display: 'grid',
            placeItems: 'center',
            borderRadius: 'var(--radius-md)',
            background: 'color-mix(in srgb, var(--danger) 12%, transparent)',
            color: 'var(--danger)',
          }}
        >
          <AlertTriangle size={24} />
        </span>
        <h1 style={{ margin: 0, fontSize: 'clamp(20px, 3vw, 26px)', fontWeight: 900 }}>
          Đã xảy ra lỗi
        </h1>
        <p style={{ margin: 0, color: 'var(--muted)', lineHeight: 1.6 }}>
          Dữ liệu của bạn vẫn được giữ. Hãy thử tải lại phần này hoặc quay về trang chính.
        </p>
        {error.digest ? (
          <code
            style={{
              maxWidth: '100%',
              overflowWrap: 'anywhere',
              padding: '6px 10px',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--surface-soft)',
              color: 'var(--muted)',
              fontSize: 12,
            }}
          >
            Mã lỗi: {error.digest}
          </code>
        ) : null}
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 10,
            justifyContent: 'center',
            marginTop: 6,
          }}
        >
          {recover ? (
            <button type="button" className="btn" onClick={recover}>
              <RotateCcw size={16} aria-hidden="true" />
              Thử lại
            </button>
          ) : null}
          <Link href="/" className="btn secondary">
            <House size={16} aria-hidden="true" />
            Về trang chủ
          </Link>
        </div>
      </div>
    </main>
  );
}
