import { requireUser } from '@/lib/supabase/session';
import SubjectExamSetsClient from './SubjectExamSetsClient';

export const dynamic = 'force-dynamic';

export default async function SubjectExamSetsPage({
  params,
}: {
  params: Promise<{ subjectCode: string }>;
}) {
  await requireUser();
  const { subjectCode } = await params;
  return <SubjectExamSetsClient subjectCode={subjectCode.toUpperCase()} />;
}
