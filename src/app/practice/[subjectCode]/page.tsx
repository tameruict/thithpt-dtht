import type { Metadata } from 'next';
import { requireUser } from '@/lib/supabase/session';
import PracticeClient from './PracticeClient';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ subjectCode: string }>;
}): Promise<Metadata> {
  const { subjectCode } = await params;
  const code = subjectCode.trim().toUpperCase();
  return {
    title: `${code} — Tự luyện`,
    description: `Tùy chọn số câu và độ khó để bắt đầu tự luyện môn ${code}.`,
  };
}

export default async function PracticePage({
  params,
}: {
  params: Promise<{ subjectCode: string }>;
}) {
  await requireUser();
  const { subjectCode } = await params;
  return <PracticeClient subjectCode={subjectCode.toUpperCase()} />;
}
