import { connection } from 'next/server';
import RegisterPageClient from './RegisterPageClient';

// Trang có nút "Tiếp tục với Google" nên phải render động: nonce CSP theo
// request (xem src/proxy.ts) chỉ áp vào script khi trang dựng tại request
// time. Prerender tĩnh khiến strict-dynamic CSP chặn script trên production.
export default async function RegisterPage() {
  await connection();
  return <RegisterPageClient />;
}
