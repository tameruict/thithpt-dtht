import type { Metadata } from 'next';
export const metadata: Metadata = { title: 'Vào phòng thi miễn phí', description: 'Bắt đầu phòng thi miễn phí, không cần key.' };
export default function RoomLayout({ children }: Readonly<{ children: React.ReactNode }>) { return children; }
