import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Quản trị',
  description: 'Quản lý phòng thi, key, doanh thu và ngân hàng đề.',
};

export default function Layout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
