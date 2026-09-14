import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Thi thử',
  description: 'Chọn môn và phòng thi THPT để bắt đầu luyện tập.',
};

export default function Layout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
