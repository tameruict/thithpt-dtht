import { connection } from 'next/server';
import ExamPageClient from './ExamPageClient';

// Cần render động để nonce CSP theo request (xem src/proxy.ts) khớp với
// script tag — prerender tĩnh khiến strict-dynamic CSP chặn hydrate trên
// production.
export default async function ExamPage() {
  await connection();
  return <ExamPageClient />;
}
