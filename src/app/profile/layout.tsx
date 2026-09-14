import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Hồ sơ',
  description: 'Quản lý hồ sơ học sinh, key và lịch sử giao dịch.',
};

export default function Layout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
