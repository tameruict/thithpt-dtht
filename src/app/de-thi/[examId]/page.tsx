import type { Metadata } from 'next';
import { requireUser } from '@/lib/supabase/session';
import { fetchExamDetail } from '@/lib/supabase/exam-data';
import ExamDetailClient from './ExamDetailClient';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ examId: string }>;
}): Promise<Metadata> {
  const { examId } = await params;
  const { supabase } = await requireUser();
  const exam = await fetchExamDetail(supabase, examId).catch(() => null);
  return {
    title: exam ? exam.title : 'Chi tiết đề thi',
    description: exam
      ? `Đề thi ${exam.subjectName} năm ${exam.year} — ${exam.questionCount} câu, ${exam.durationMinutes} phút.`
      : 'Chi tiết đề thi trong ngân hàng đề.',
  };
}

export default async function ExamDetailPage({
  params,
}: {
  params: Promise<{ examId: string }>;
}) {
  const { supabase } = await requireUser();
  const { examId } = await params;
  const exam = await fetchExamDetail(supabase, examId);

  return <ExamDetailClient examId={examId} initialExam={exam} />;
}
