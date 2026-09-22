import { requireUser } from '@/lib/supabase/session';
import RoomKeyPageClient from '../../room-key/RoomKeyPageClient';
import PurchasePage from '../../purchase/page';

export const dynamic = 'force-dynamic';

export default async function JoinRoomPage({
  params,
}: {
  params: Promise<{ roomId: string }>;
}) {
  await requireUser();
  const { roomId } = await params;
  if (roomId === '__purchase') {
    return <PurchasePage />;
  }
  return <RoomKeyPageClient roomId={roomId} />;
}
