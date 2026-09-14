import { requireAdmin } from '@/lib/supabase/admin';
import type { Json } from '@/lib/supabase/database';
import ContentQualityClient, { type ContentReview } from './ContentQualityClient';
import AdminSuiteNav from '../AdminSuiteNav';
import styles from './content-quality.module.css';

export const dynamic = 'force-dynamic';

function toReviews(data: Json | null): ContentReview[] {
  if (!Array.isArray(data)) return [];
  return data.filter((row): row is ContentReview => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) return false;
    return typeof row.id === 'string' && typeof row.question_code === 'string';
  });
}

export default async function ContentQualityPage() {
  const { supabase } = await requireAdmin();
  const { data, error } = await supabase.rpc('get_question_content_review_queue', {
    p_status: 'pending',
    p_limit: 100,
  });

  if (error) {
    return (
      <main className={styles.page} id="main">
        <AdminSuiteNav active="content" />
        <section className={styles.errorState} role="alert" aria-labelledby="content-quality-error-title">
          <p className={styles.errorEyebrow}>ADMIN - CONTENT</p>
          <h1 id="content-quality-error-title">Không thể tải hàng đợi duyệt nội dung</h1>
          <p>Dịch vụ duyệt chưa sẵn sàng hoặc migration chưa hoàn tất. Vui lòng thử lại.</p>
          <code>Mã lỗi: {error.code || 'UNKNOWN'}</code>
          <a className={styles.errorAction} href="/admin/content-quality">Thử lại</a>
        </section>
      </main>
    );
  }

  return <ContentQualityClient reviews={toReviews(data)} />;
}
