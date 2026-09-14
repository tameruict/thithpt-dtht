import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Kết quả',
  description: 'Theo dõi lịch sử, điểm số và chi tiết các bài thi THPT.',
};

export default function Layout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
