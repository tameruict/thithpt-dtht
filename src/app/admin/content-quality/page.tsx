import { requireAdmin } from '@/lib/supabase/admin';
import type { Json } from '@/lib/supabase/database';
import ContentQualityClient, { type ContentReview } from './ContentQualityClient';

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
    p_after: null,
  });

  if (error) {
    return (
      <main style={{ maxWidth: 900, margin: '48px auto', padding: 24 }}>
        <h1>Chất lượng nội dung</h1>
        <p>Database staging chưa có migration Markdown + KaTeX v2.</p>
        <code>{error.code}</code>
      </main>
    );
  }

  return <ContentQualityClient reviews={toReviews(data)} />;
}

