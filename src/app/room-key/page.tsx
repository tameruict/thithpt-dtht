import { connection } from 'next/server';
import RoomKeyPageClient from './RoomKeyPageClient';

// Cần render động để nonce CSP theo request (xem src/proxy.ts) khớp với
// script tag — prerender tĩnh khiến strict-dynamic CSP chặn hydrate trên
// production.
export default async function RoomKeyPage() {
  await connection();
  return <RoomKeyPageClient />;
}
