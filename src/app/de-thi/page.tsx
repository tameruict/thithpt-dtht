import type { Metadata } from 'next';
import { requireUser } from '@/lib/supabase/session';
import DeThiClient from './DeThiClient';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Ngân hàng đề thi',
  description: 'Chọn đề thi THPT theo môn và năm để bắt đầu làm bài.',
};

export default async function DeThiPage() {
  await requireUser();
  return <DeThiClient />;
}
