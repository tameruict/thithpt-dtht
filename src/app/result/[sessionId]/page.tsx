import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { requireUser } from '@/lib/supabase/session';
import ResultPage from '../page';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Chi tiết kết quả',
  description: 'Xem điểm số, thống kê và đáp án của phiên thi.',
};

export default async function SessionResultPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { supabase, user } = await requireUser();
  const { sessionId } = await params;
  const { data: session } = await supabase
    .from('exam_sessions')
    .select('id')
    .eq('id', sessionId)
    .eq('student_id', user.id)
    .maybeSingle();

  if (!session) redirect('/subjects');
  return <ResultPage sessionId={sessionId} />;
}
