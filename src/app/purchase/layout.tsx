import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Mua key',
  description: 'Chọn gói key và lượt thi phù hợp.',
};

export default function Layout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
