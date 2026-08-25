'use server';

import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/supabase/admin';

export async function resolveContentReview(
  reviewId: string,
  action: 'approve' | 'reject',
) {
  const { supabase } = await requireAdmin();
  const { error } = await supabase.rpc('apply_question_content_review', {
    p_review_id: reviewId,
    p_action: action,
  });
  if (error) return { ok: false as const, error: error.message };
  revalidatePath('/admin/content-quality');
  return { ok: true as const };
}

