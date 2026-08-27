import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/supabase/session';
import { loadCandidateProfile } from '@/lib/supabase/user-profile';
import type { CandidateInfo } from '@/store/useExamStore';
import ExamPage from '../page';

export const dynamic = 'force-dynamic';

export default async function SessionExamPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { supabase, user } = await requireUser();
  const { sessionId } = await params;
  const [{ data: session }, profile] = await Promise.all([
    supabase
      .from('exam_sessions')
      .select('id,status')
      .eq('id', sessionId)
      .eq('student_id', user.id)
      .maybeSingle(),
    loadCandidateProfile(supabase, user),
  ]);

  if (!session) redirect('/subjects');
  if (session.status !== 'in_progress') redirect(`/result/${sessionId}`);
  const candidate: CandidateInfo = {
    code: profile.code,
    name: profile.name,
    school: profile.school,
    dob: profile.dob,
    gender: profile.gender,
    province: profile.province,
    district: profile.district,
    phone: profile.phone,
    session: null,
  };

  return <ExamPage sessionId={sessionId} candidate={candidate} />;
}
