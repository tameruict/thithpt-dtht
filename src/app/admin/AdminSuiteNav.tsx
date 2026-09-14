import Link from 'next/link';
import { BarChart3, BookCheck, BookOpenCheck, CreditCard, DoorOpen, PackageOpen } from 'lucide-react';
import styles from './admin-suite-nav.module.css';

type AdminArea = 'dashboard' | 'operations' | 'revenue' | 'subjects' | 'content' | 'products';

const items = [
  { id: 'dashboard', href: '/admin', label: 'Tổng quan', icon: BarChart3 },
  { id: 'operations', href: '/admin#rooms', label: 'Phòng thi & key', icon: DoorOpen },
  { id: 'revenue', href: '/admin/purchases', label: 'Doanh thu', icon: CreditCard },
  { id: 'subjects', href: '/admin#compose', label: 'Môn thi & đề', icon: BookOpenCheck },
  { id: 'content', href: '/admin/content-quality', label: 'Duyệt nội dung', icon: BookCheck },
  { id: 'products', href: '/admin/key-products', label: 'Gói key', icon: PackageOpen },
] as const;

export default function AdminSuiteNav({ active }: { active: AdminArea }) {
  return (
    <nav className={styles.nav} aria-label="Điều hướng khu vực quản trị">
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <Link
            key={item.id}
            href={item.href}
            className={styles.link}
            aria-current={active === item.id ? 'page' : undefined}
          >
            <Icon size={16} strokeWidth={2} aria-hidden="true" />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
