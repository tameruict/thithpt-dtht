import type { Metadata } from 'next';
import { requireUser } from '@/lib/supabase/session';
import SubjectExamSetsClient from './SubjectExamSetsClient';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ subjectCode: string }>;
}): Promise<Metadata> {
  const { subjectCode } = await params;
  const code = subjectCode.trim().toUpperCase();
  return {
    title: `${code} — Phòng thi`,
    description: `Chọn phòng thi đang mở cho môn ${code} và bắt đầu miễn phí.`,
  };
}

export default async function SubjectExamSetsPage({
  params,
}: {
  params: Promise<{ subjectCode: string }>;
}) {
  await requireUser();
  const { subjectCode } = await params;
  return <SubjectExamSetsClient subjectCode={subjectCode.toUpperCase()} />;
}
