import { connection } from 'next/server';
import ProfilePageClient from './ProfilePageClient';

// Cần render động để nonce CSP theo request (xem src/proxy.ts) khớp với
// script tag — prerender tĩnh khiến strict-dynamic CSP chặn hydrate trên
// production.
export default async function ProfilePage() {
  await connection();
  return <ProfilePageClient />;
}
