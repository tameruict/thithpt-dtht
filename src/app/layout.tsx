import { Be_Vietnam_Pro, JetBrains_Mono } from 'next/font/google';
import type { Metadata } from 'next';
import { connection } from 'next/server';
import './globals.css';
import 'katex/dist/katex.min.css';
import AppProviders from '@/components/providers/AppProviders';

const beVietnam = Be_Vietnam_Pro({
  subsets: ['latin', 'vietnamese'],
  weight: ['400', '500', '600', '700', '800', '900'],
  display: 'swap',
  variable: '--font-ui',
});

const jetBrainsMono = JetBrains_Mono({
  subsets: ['latin'],
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

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // A per-request CSP nonce requires dynamic rendering so Next can attach the
  // nonce to every framework script emitted for this response.
  await connection();

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
