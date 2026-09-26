import localFont from 'next/font/local';
import type { Metadata } from 'next';
import './globals.css';
import 'katex/dist/katex.min.css';
import AppProviders from '@/components/providers/AppProviders';

// Chỉ tải 3 weights thực sự dùng (400 body · 600 semibold · 800 heading).
// Trước đây tải 6 weights (~2x dung lượng font chặn FCP).
const beVietnam = localFont({
  src: [
    {
      path: './fonts/BeVietnamPro-Regular.ttf',
      weight: '400',
      style: 'normal',
    },
    {
      path: './fonts/BeVietnamPro-SemiBold.ttf',
      weight: '600',
      style: 'normal',
    },
    {
      path: './fonts/BeVietnamPro-ExtraBold.ttf',
      weight: '800',
      style: 'normal',
    },
  ],
  display: 'swap',
  variable: '--font-ui',
});

const jetBrainsMono = localFont({
  src: './fonts/JetBrainsMono-Variable.ttf',
  weight: '100 800',
  style: 'normal',
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
      className={`${beVietnam.variable} ${jetBrainsMono.variable}`}
      suppressHydrationWarning
    >
      <body><AppProviders>{children}</AppProviders></body>
    </html>
  );
}
