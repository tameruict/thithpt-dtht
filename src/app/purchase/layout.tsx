import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Gói luyện thi THPT',
  description:
    'Chọn gói lượt thi phù hợp, thanh toán VietQR và nhận key tự động để tiếp tục luyện đề trên toàn hệ thống.',
};

export default function PurchaseLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children;
}
