import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { requireUser } from '@/lib/supabase/session';
import { loadCandidateProfile } from '@/lib/supabase/user-profile';
import type { CandidateInfo } from '@/store/useExamStore';
import ExamPageClient from '../ExamPageClient';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Bài thi đang diễn ra',
  description: 'Hoàn thành các câu hỏi trong phiên thi hiện tại.',
};

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

  if (!session) redirect('/de-thi');
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

  return <ExamPageClient sessionId={sessionId} candidate={candidate} />;
}
