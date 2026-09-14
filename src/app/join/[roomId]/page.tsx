import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { requireUser } from '@/lib/supabase/session';
import RoomKeyPage from '../../room-key/page';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Vào phòng thi',
  description: 'Kiểm tra phòng thi và nhập key để bắt đầu làm bài.',
};

export default async function JoinRoomPage({
  params,
}: {
  params: Promise<{ roomId: string }>;
}) {
  await requireUser();
  const { roomId } = await params;
  if (roomId === '__purchase') {
    // Keep the legacy sentinel as a compatibility redirect so global
    // navigation correctly marks the canonical purchase destination.
    redirect('/purchase');
  }
  return <RoomKeyPage roomId={roomId} />;
}
