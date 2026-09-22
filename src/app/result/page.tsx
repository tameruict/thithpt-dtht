import { connection } from 'next/server';
import ResultPageClient from './ResultPageClient';

// Cần render động để nonce CSP theo request (xem src/proxy.ts) khớp với
// script tag — prerender tĩnh khiến strict-dynamic CSP chặn hydrate trên
// production.
export default async function ResultPage() {
  await connection();
  return <ResultPageClient />;
}
