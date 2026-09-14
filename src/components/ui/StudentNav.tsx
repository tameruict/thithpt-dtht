'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BookOpen, ClipboardCheck, KeyRound, UserRound } from 'lucide-react';
import styles from './StudentNav.module.css';

const items = [
  { href: '/subjects', label: 'Thi thử', hint: 'Chọn môn và phòng thi', Icon: ClipboardCheck },
  { href: '/result', label: 'Kết quả', hint: 'Xem lịch sử làm bài', Icon: BookOpen },
  { href: '/purchase', label: 'Mua key', hint: 'Mua lượt thi', Icon: KeyRound },
  { href: '/profile', label: 'Hồ sơ', hint: 'Thông tin tài khoản', Icon: UserRound },
] as const;

/** Shared student navigation. It becomes a thumb-friendly bottom bar on phones. */
export default function StudentNav() {
  const pathname = usePathname();
  return (
    <nav className={styles.nav} aria-label="Điều hướng học sinh">
      <div className={styles.inner}>
        <span className={styles.brand}>Luyện thi THPT</span>
        <div className={styles.links}>
          {items.map(({ href, label, hint, Icon }) => {
            // Keep the complete exam flow (subject selection, room join, practice,
            // and active exam) grouped under the Thi thử destination.
            const active =
              pathname === href ||
              pathname.startsWith(`${href}/`) ||
              (href === '/subjects' &&
                (pathname === '/join' ||
                  pathname.startsWith('/join/') ||
                  pathname === '/exam' ||
                  pathname.startsWith('/exam/') ||
                  pathname === '/practice' ||
                  pathname.startsWith('/practice/')));
            return (
              <Link
                key={href}
                href={href}
                className={`${styles.link} ${active ? styles.active : ''}`}
                aria-current={active ? 'page' : undefined}
                title={hint}
              >
                <Icon size={18} strokeWidth={active ? 2.4 : 2} aria-hidden="true" />
                <span>{label}</span>
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
