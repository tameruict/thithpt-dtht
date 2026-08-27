'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check, X } from 'lucide-react';
import { resolveContentReview } from './actions';
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

export default function ContentQualityClient({ reviews }: { reviews: ContentReview[] }) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState('');
  const [message, setMessage] = useState('');
  const [isPending, startTransition] = useTransition();

  const resolve = (review: ContentReview, action: 'approve' | 'reject') => {
    if (action === 'approve' && review.proposed_value === null) {
      setMessage('Đề xuất trống cần được sửa trong workspace trước khi duyệt.');
      return;
    }
    setPendingId(review.id);
    setMessage('');
    startTransition(async () => {
      const result = await resolveContentReview(review.id, action);
      setPendingId('');
      if (!result.ok) {
        setMessage(result.error);
        return;
      }
      router.refresh();
    });
  };

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <p>Admin · Chất lượng nội dung</p>
          <h1>Duyệt Markdown + KaTeX</h1>
        </div>
      </header>

      <p className={styles.summary}>{reviews.length} đề xuất đang chờ duyệt.</p>
      {message ? <div className={styles.message} role="status">{message}</div> : null}

      <section className={styles.list}>
        {reviews.map((review) => (
          <article className={styles.card} key={review.id}>
            <div className={styles.meta}>
              <strong>{review.question_code}</strong>
              <span>{review.entity_type}.{review.field_name}</span>
              <span data-severity={review.severity}>{review.issue_codes.join(', ')}</span>
            </div>
            <div className={styles.compare}>
              <div><b>Hiện tại</b><pre>{review.original_value}</pre></div>
              <div><b>Đề xuất</b><pre>{review.proposed_value}</pre></div>
            </div>
            <div className={styles.actions}>
              <button
                type="button"
                disabled={isPending && pendingId === review.id}
                onClick={() => resolve(review, 'reject')}
              ><X size={16} /> Từ chối</button>
              <button
                type="button"
                disabled={isPending && pendingId === review.id}
                onClick={() => resolve(review, 'approve')}
              ><Check size={16} /> Áp dụng</button>
            </div>
          </article>
        ))}
        {reviews.length === 0 ? (
          <div className={styles.empty}>Không còn đề xuất nội dung chờ duyệt.</div>
        ) : null}
      </section>
    </main>
  );
}

