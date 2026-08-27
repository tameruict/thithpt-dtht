import { requireUser } from '@/lib/supabase/session';
import PracticeClient from './PracticeClient';

export const dynamic = 'force-dynamic';

export default async function PracticePage({
  params,
}: {
  params: Promise<{ subjectCode: string }>;
}) {
  await requireUser();
  const { subjectCode } = await params;
  return <PracticeClient subjectCode={subjectCode.toUpperCase()} />;
}
