import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Nhập key phòng thi',
  description: 'Nhập key để tham gia phòng thi hoặc phòng tự luyện.',
};

export default function Layout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
