'use client';

import { useEffect } from 'react';

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[app-error]', error.digest ?? error.message);
  }, [error]);

  return (
    <main id="app" className="route-error" role="alert">
      <h1>Đã xảy ra lỗi</h1>
      <p>Dữ liệu của bạn vẫn được giữ. Hãy thử tải lại phần này.</p>
      <button type="button" className="btn" onClick={reset}>
        Thử lại
      </button>
    </main>
  );
}
