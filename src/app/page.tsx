import { connection } from 'next/server';
import LoginPageClient from './LoginPageClient';

// Trang có nút "Tiếp tục với Google" nên phải render động: nonce CSP được
// cấp mới mỗi request (xem src/proxy.ts) và chỉ áp vào script khi trang
// dựng tại request time. Prerender tĩnh khiến strict-dynamic CSP chặn toàn
// bộ script trên production, trang không hydrate, mọi nút bấm im lặng.
export default async function LoginPage() {
  await connection();
  return <LoginPageClient />;
}
