import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/supabase/session';
import ResultPage from '../page';

export const dynamic = 'force-dynamic';

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
