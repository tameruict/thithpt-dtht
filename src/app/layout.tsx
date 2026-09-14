import { Be_Vietnam_Pro, JetBrains_Mono } from 'next/font/google';
import type { Metadata } from 'next';
import './globals.css';
import 'katex/dist/katex.min.css';
import AppProviders from '@/components/providers/AppProviders';

// Chỉ tải 3 weights thực sự dùng (400 body · 600 semibold · 800 heading).
// Trước đây tải 6 weights (~2x dung lượng font chặn FCP).
const beVietnam = Be_Vietnam_Pro({
  subsets: ['latin', 'vietnamese'],
  weight: ['400', '600', '800'],
  display: 'swap',
  variable: '--font-ui',
});

const jetBrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '600'],
  display: 'swap',
  variable: '--font-mono',
});

export const metadata: Metadata = {
  title: {
    default: 'Thi Tốt Nghiệp THPT Quốc Gia',
    template: '%s | Thi THPT',
  },
  description: 'Nền tảng thi và tự luyện tốt nghiệp THPT.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // KHÔNG gọi connection() ở đây: nó ép toàn bộ app thành dynamic rendering,
  // mọi điều hướng đều phải chờ server — nguồn lag lớn nhất của web.
  // Các trang cần dynamic đã tự khai báo `export const dynamic = 'force-dynamic'`.
  return (
    <html
      lang="vi"
      data-theme="light"
      data-scroll-behavior="smooth"
      suppressHydrationWarning
    >
      <body className={`${beVietnam.variable} ${jetBrainsMono.variable}`}>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
