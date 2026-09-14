'use client';

import { useDeferredValue, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Check, ChevronLeft, ChevronRight, Inbox, Search, X } from 'lucide-react';
import { resolveContentReview } from './actions';
import { showToast } from '@/components/ui/Toast';
import AdminSuiteNav from '../AdminSuiteNav';
import styles from './content-quality.module.css';

export type ContentReview = {
  id: string;
  question_id: string;
  question_code: string;
  entity_type: string;
  field_name: string;
  original_value: string | null;
  proposed_value: string | null;
  issue_codes: string[];
  severity: 'warning' | 'error';
  detected_at: string;
};

const PAGE_SIZE = 10;

export default function ContentQualityClient({ reviews }: { reviews: ContentReview[] }) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState('');
  const [message, setMessage] = useState('');
  const [messageTone, setMessageTone] = useState<'info' | 'error'>('info');
  const [isPending, setIsPending] = useState(false);
  const [search, setSearch] = useState('');
  const [severityFilter, setSeverityFilter] = useState('');
  const [page, setPage] = useState(1);
  const deferredSearch = useDeferredValue(search);

  // Reset trang trong onChange (không dùng effect). Memo phân trang vẫn clamp page.

  const stats = useMemo(() => {
    let errors = 0;
    for (const review of reviews) {
      if (review.severity === 'error') errors += 1;
    }
    return { total: reviews.length, errors, warnings: reviews.length - errors };
  }, [reviews]);

  // UI search/filter phục vụ lọc server-side sau này; hiện giữ data từ server action cũ.
  // TODO(server-search): chuyển p_status/p_search/p_cursor vào RPC get_question_content_review_queue.
  const filtered = useMemo(() => {
    const term = deferredSearch.trim().toLowerCase();
    return reviews.filter((review) => {
      if (severityFilter && review.severity !== severityFilter) return false;
      if (
        term &&
        ![
          review.question_code,
          review.entity_type,
          review.field_name,
          review.issue_codes.join(' '),
        ].some((value) => value.toLowerCase().includes(term))
      ) {
        return false;
      }
      return true;
    });
  }, [reviews, deferredSearch, severityFilter]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const paged = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const resolve = (review: ContentReview, action: 'approve' | 'reject') => {
    if (action === 'approve' && review.proposed_value === null) {
      const warn = 'Đề xuất trống cần được sửa trong workspace trước khi duyệt.';
      setMessage(warn);
      setMessageTone('error');
      showToast(warn, 'warning');
      return;
    }
    setPendingId(review.id);
    setMessage('');
    setIsPending(true);
    void (async () => {
      const result = await resolveContentReview(review.id, action);
      setPendingId('');
      setIsPending(false);
      if (!result.ok) {
        setMessage(result.error);
        setMessageTone('error');
        showToast(result.error, 'error');
        return;
      }
      const done = action === 'approve' ? `Đã áp dụng đề xuất ${review.question_code}.` : `Đã từ chối đề xuất ${review.question_code}.`;
      setMessage(done);
      setMessageTone('info');
      showToast(done, 'success');
      router.refresh();
    })();
  };

  return (
    <main className={styles.page} id="main">
      <header className={styles.header}>
        <div>
          <p>Admin · Chất lượng nội dung</p>
          <h1>Duyệt Markdown + KaTeX</h1>
        </div>
        <Link href="/admin">Về Dashboard</Link>
      </header>

      <AdminSuiteNav active="content" />

      <div className={styles.stats} aria-label="Thống kê hàng chờ">
        <div>
          <strong>{stats.total}</strong>
          <span>Đề xuất chờ duyệt</span>
        </div>
        <div>
          <strong>{stats.errors}</strong>
          <span>Mức lỗi</span>
        </div>
        <div>
          <strong>{stats.warnings}</strong>
          <span>Mức cảnh báo</span>
        </div>
      </div>

      <div className={styles.toolbar}>
        <div className={styles.toolbarGroup}>
          <label>
            Tìm kiếm
            <input
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
              placeholder="Mã câu hỏi, trường, mã lỗi..."
              aria-label="Tìm đề xuất"
              className={styles.searchInput}
            />
          </label>
          <label>
            Mức độ
            <select value={severityFilter} onChange={(event) => {
              setSeverityFilter(event.target.value);
              setPage(1);
            }} aria-label="Lọc theo mức độ">
              <option value="">Tất cả</option>
              <option value="error">Lỗi</option>
              <option value="warning">Cảnh báo</option>
            </select>
          </label>
        </div>
        <p className={`${styles.summary} ${styles.summaryCompact}`}>
          {filtered.length}/{reviews.length} đề xuất
          {deferredSearch.trim() || severityFilter ? ' khớp bộ lọc' : ' đang chờ duyệt'}.
        </p>
      </div>

      {message ? (
        <div className={styles.message} role="status" aria-live="polite" data-tone={messageTone}>
          {message}
        </div>
      ) : null}

      <section className={styles.list} aria-label="Danh sách đề xuất">
        {paged.map((review) => {
          const busy = isPending && pendingId === review.id;
          return (
            <article className={styles.card} key={review.id}>
              <div className={styles.meta}>
                <strong>{review.question_code}</strong>
                <span>{review.entity_type}.{review.field_name}</span>
                <span data-severity={review.severity}>{review.issue_codes.join(', ')}</span>
                <span>{new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(review.detected_at))}</span>
              </div>
              <div className={styles.compare}>
                <div><b>Hiện tại</b><pre>{review.original_value ?? '(trống)'}</pre></div>
                <div><b>Đề xuất</b><pre>{review.proposed_value ?? '(trống)'}</pre></div>
              </div>
              <div className={styles.actions}>
                <button type="button" disabled={busy} onClick={() => resolve(review, 'reject')} aria-label={`Từ chối đề xuất ${review.question_code}`}>
                  <X size={16} aria-hidden="true" /> {busy ? 'Đang xử lý...' : 'Từ chối'}
                </button>
                <button type="button" disabled={busy} onClick={() => resolve(review, 'approve')} aria-label={`Áp dụng đề xuất ${review.question_code}`}>
                  <Check size={16} aria-hidden="true" /> {busy ? 'Đang xử lý...' : 'Áp dụng'}
                </button>
              </div>
            </article>
          );
        })}
        {paged.length === 0 ? (
          <div className={styles.empty}>
            <Search className={styles.emptyIcon} size={22} aria-hidden="true" />
            {reviews.length === 0 ? 'Không còn đề xuất nội dung chờ duyệt.' : 'Không có đề xuất nào khớp bộ lọc.'}
          </div>
        ) : null}
      </section>

      {filtered.length > 0 ? (
        <div className={styles.pagination}>
          <span>
            Trang {safePage}/{pageCount} · {filtered.length} đề xuất
          </span>
          <div>
            <button type="button" onClick={() => setPage(safePage - 1)} disabled={safePage <= 1} aria-label="Trang trước">
              <ChevronLeft size={15} aria-hidden="true" />
            </button>
            <button type="button" onClick={() => setPage(safePage + 1)} disabled={safePage >= pageCount} aria-label="Trang sau">
              <ChevronRight size={15} aria-hidden="true" />
            </button>
          </div>
        </div>
      ) : null}

      <p className={`${styles.summary} ${styles.tip}`}>
        <Inbox size={15} aria-hidden="true" /> Duyệt xong đề xuất sẽ biến mất sau khi tải lại (router.refresh).
      </p>
    </main>
  );
}
