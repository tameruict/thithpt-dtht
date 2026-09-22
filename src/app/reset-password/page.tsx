import { connection } from 'next/server';
import ResetPasswordPageClient from './ResetPasswordPageClient';

// Cần render động để nonce CSP theo request (xem src/proxy.ts) khớp với
// script tag — prerender tĩnh khiến strict-dynamic CSP chặn hydrate trên
// production.
export default async function ResetPasswordPage() {
  await connection();
  return <ResetPasswordPageClient />;
}
