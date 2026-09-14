import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { requireUser } from '@/lib/supabase/session';
import RoomKeyPage from '../../room-key/page';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Vào phòng thi',
  description: 'Bắt đầu phòng thi miễn phí, không cần key.',
};

export default async function JoinRoomPage({
  params,
}: {
  params: Promise<{ roomId: string }>;
}) {
  await requireUser();
  const { roomId } = await params;
  if (roomId === '__purchase') {
    redirect('/subjects');
  }
  return <RoomKeyPage roomId={roomId} />;
}
