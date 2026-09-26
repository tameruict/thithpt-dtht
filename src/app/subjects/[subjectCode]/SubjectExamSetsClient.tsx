'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  CheckCircle2,
  FileText,
  Inbox,
  KeyRound,
  LogOut,
  Moon,
  Search,
  Sun,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { hasSupabaseEnv } from '@/lib/supabase/env';
import {
  clearReferenceCache,
  fetchStudentRoomScores,
  fetchSubjectWithRooms,
  formatPriceVnd,
  type ExamRoomSummary,
  type RoomScore,
  type SubjectSummary,
} from '@/lib/supabase/exam-data';
import { useExamStore } from '@/store/useExamStore';
import RoomLeaderboard from '@/components/leaderboard/RoomLeaderboard';
import StudentNav from '@/components/ui/StudentNav';
import styles from '@/styles/subjects.module.css';

type SortOption = 'default' | 'score-desc' | 'undone-first' | 'name-asc';

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: 'default', label: 'Mặc định' },
  { value: 'score-desc', label: 'Điểm cao → thấp' },
  { value: 'undone-first', label: 'Chưa làm trước' },
  { value: 'name-asc', label: 'Tên A→Z' },
];

/** Điểm cao nhất, 2 chữ số thập phân. */
function formatBestScore(value: number): string {
  return value.toFixed(2);
}

/** Thang điểm bỏ số 0 thừa: 10.00 → "10", 9.50 → "9.5". */
function formatMaxScore(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2)));
}

/** Quy đổi điểm về thang 10 để so sánh/tính trung bình khi maxScore khác nhau. */
function normalizeToTen(score: RoomScore): number {
  if (!score.maxScore || score.maxScore <= 0) return score.bestScore;
  return (score.bestScore / score.maxScore) * 10;
}

export default function SubjectExamSetsClient({
  subjectCode,
}: {
  subjectCode: string;
}) {
  const router = useRouter();
  const hasConfiguredSupabase = hasSupabaseEnv();
  const theme = useExamStore((state) => state.theme);
  const setTheme = useExamStore((state) => state.setTheme);
  const selectExamSet = useExamStore((state) => state.selectExamSet);
  const logout = useExamStore((state) => state.logout);
  const [subject, setSubject] = useState<SubjectSummary | null>(null);
  const [rooms, setRooms] = useState<ExamRoomSummary[]>([]);
  const [scores, setScores] = useState<Map<string, RoomScore>>(new Map());
  const [isLoading, setIsLoading] = useState(hasConfiguredSupabase);
  const [loadError, setLoadError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [loggingOut, setLoggingOut] = useState(false);
  const [query, setQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('default');

  const handleLogout = useCallback(async () => {
    setLoggingOut(true);
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
      clearReferenceCache();
      logout();
      router.push('/', { transitionTypes: ['nav-back'] });
    } catch {
      setLoggingOut(false);
    }
  }, [logout, router]);

  useEffect(() => {
    if (!hasConfiguredSupabase) return;

    let isMounted = true;
    const supabase = createClient();

    fetchSubjectWithRooms(supabase, subjectCode)
      .then(({ subject: loadedSubject, rooms: loadedRooms }) => {
        if (!isMounted) return;

        if (!loadedSubject) {
          router.push('/subjects');
          return;
        }

        setSubject(loadedSubject);
        setRooms(loadedRooms);
        setLoadError('');
      })
      .catch((error: unknown) => {
        if (!isMounted) return;
        const message =
          error instanceof Error
            ? error.message
            : 'Không thể tải dữ liệu phòng thi từ Supabase.';
        setLoadError(message);
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    // Điểm cá nhân tải song song, KHÔNG chặn hiển thị phòng: lỗi thì bỏ qua,
    // danh sách vẫn hiện (chỉ thiếu badge điểm).
    fetchStudentRoomScores(supabase)
      .then((map) => {
        if (isMounted) setScores(map);
      })
      .catch(() => {
        if (isMounted) setScores(new Map());
      });

    return () => {
      isMounted = false;
    };
  }, [hasConfiguredSupabase, reloadKey, router, subjectCode]);

  const displayLoadError =
    loadError ||
    (!hasConfiguredSupabase
      ? 'Chưa cấu hình Supabase nên không thể tải phòng thi.'
      : '');

  // Tổng quan: tổng đề, số đề đã làm, điểm trung bình (thang 10) của best-score.
  const summary = useMemo(() => {
    const doneRooms = rooms.filter((room) => scores.has(room.id));
    const normalized = doneRooms.map((room) => normalizeToTen(scores.get(room.id)!));
    const average =
      normalized.length > 0
        ? normalized.reduce((sum, value) => sum + value, 0) / normalized.length
        : null;
    return {
      total: rooms.length,
      done: doneRooms.length,
      average,
    };
  }, [rooms, scores]);

  const visibleRooms = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    const filtered = trimmed
      ? rooms.filter(
          (room) =>
            room.name.toLowerCase().includes(trimmed) ||
            room.code.toLowerCase().includes(trimmed),
        )
      : rooms.slice();

    switch (sortBy) {
      case 'score-desc':
        // Đề đã làm (điểm cao trước) rồi tới đề chưa làm, giữ nguyên thứ tự gốc.
        return filtered.sort((a, b) => {
          const sa = scores.get(a.id);
          const sb = scores.get(b.id);
          if (sa && sb) return normalizeToTen(sb) - normalizeToTen(sa);
          if (sa) return -1;
          if (sb) return 1;
          return 0;
        });
      case 'undone-first':
        return filtered.sort((a, b) => {
          const da = scores.has(a.id) ? 1 : 0;
          const db = scores.has(b.id) ? 1 : 0;
          return da - db;
        });
      case 'name-asc':
        return filtered.sort((a, b) => a.name.localeCompare(b.name, 'vi'));
      case 'default':
      default:
        return filtered;
    }
  }, [rooms, scores, query, sortBy]);

  const showToolbar = !isLoading && !displayLoadError && rooms.length > 0;

  return (
    <div className={styles.screen}>
      <StudentNav />
      <div className={styles.pageTools}>
        <button
          className="btn outline small"
          type="button"
          onClick={() => router.push('/purchase', { transitionTypes: ['nav-forward'] })}
        >
          <KeyRound size={15} />
          <span>Mua thêm lượt</span>
        </button>
        <button
          className="theme-toggle"
          type="button"
          aria-label={theme === 'dark' ? 'Chuyển sang giao diện sáng' : 'Chuyển sang giao diện tối'}
          aria-pressed={theme === 'dark'}
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
        >
          <span className="icon">
            {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
          </span>
          <span>{theme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>
        </button>
        <button
          className={`btn outline small ${styles.profileButton}`}
          type="button"
          onClick={handleLogout}
          disabled={loggingOut}
        >
          <LogOut size={15} />
          <span>{loggingOut ? 'Đang đăng xuất...' : 'Đăng xuất'}</span>
        </button>
      </div>

      <main id="main" tabIndex={-1} className={styles.main}>
        <button
          className={`btn secondary small ${styles.backButton}`}
          type="button"
          onClick={() => router.push('/subjects', { transitionTypes: ['nav-back'] })}
        >
          <ArrowLeft size={15} />
          Quay lại môn thi
        </button>

        <section className={styles.examListHero} aria-labelledby="subject-rooms-title">
          <div>
            <span className={styles.heroKicker}>Phòng thi từ cơ sở dữ liệu</span>
            <h1 id="subject-rooms-title" className={styles.examTitle}>
              {subject ? `Môn ${subject.name}` : 'Đang tải môn thi'}
            </h1>
            <p>
              Chọn một phòng thi đang mở và nhập key để bắt đầu. Giờ làm bài tính theo máy chủ.
              Chưa có key? <Link href="/purchase">Mua key qua Zalo</Link>.
            </p>
          </div>
          <div className={styles.heroStat} role="status" aria-live="polite">
            <strong>{rooms.length}</strong>
            <span>phòng đang mở</span>
          </div>
        </section>

        {showToolbar ? (
          <section
            className={styles.summaryStrip}
            aria-label="Tổng quan tiến độ làm đề"
          >
            <div className={styles.summaryStat}>
              <strong>{summary.total}</strong>
              <span>tổng số đề</span>
            </div>
            <div className={styles.summaryStat}>
              <strong>{summary.done}</strong>
              <span>đề đã làm</span>
            </div>
            <div className={styles.summaryStat}>
              <strong>
                {summary.average === null ? '—' : `${summary.average.toFixed(2)}`}
              </strong>
              <span>điểm TB (/10)</span>
            </div>
          </section>
        ) : null}

        {displayLoadError ? (
          <div className={styles.emptyState} role="alert">
            <p>{displayLoadError}</p>
            {hasConfiguredSupabase ? (
              <button
                className="btn outline small"
                type="button"
                onClick={() => {
                  setLoadError('');
                  setIsLoading(true);
                  setReloadKey((value) => value + 1);
                }}
              >
                Thử tải lại
              </button>
            ) : null}
          </div>
        ) : null}

        {showToolbar ? (
          <div className={styles.listToolbar}>
            <div className={styles.searchField}>
              <Search size={16} aria-hidden="true" className={styles.searchIcon} />
              <input
                type="search"
                className={styles.searchInput}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Tìm đề theo tên hoặc mã…"
                aria-label="Tìm đề theo tên hoặc mã"
              />
            </div>
            <label className={styles.sortControl}>
              <span className={styles.visuallyHidden}>Sắp xếp danh sách đề</span>
              <select
                value={sortBy}
                onChange={(event) => setSortBy(event.target.value as SortOption)}
                aria-label="Sắp xếp danh sách đề"
              >
                {SORT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        ) : null}

        <section className={styles.examSetGrid}>
          {isLoading ? (
            <div className={styles.emptyState} role="status" aria-live="polite">Đang tải phòng thi từ Supabase...</div>
          ) : null}
          {!isLoading && rooms.length === 0 && !displayLoadError ? (
            <div className={styles.emptyState}>
              <Inbox className={styles.emptyIcon} size={32} aria-hidden="true" />
              <p>Cơ sở dữ liệu chưa có phòng thi đang mở cho môn này.</p>
              <Link className="btn outline small" href="/subjects">Chọn môn khác</Link>
            </div>
          ) : null}
          {!isLoading && rooms.length > 0 && visibleRooms.length === 0 ? (
            <div className={styles.emptyState} role="status">
              <Search className={styles.emptyIcon} size={30} aria-hidden="true" />
              <p>Không tìm thấy đề nào khớp với “{query.trim()}”.</p>
              <button
                className="btn outline small"
                type="button"
                onClick={() => setQuery('')}
              >
                Xóa tìm kiếm
              </button>
            </div>
          ) : null}
          {visibleRooms.map((room) => {
            const score = scores.get(room.id);
            return (
              <article key={room.id} className={styles.examSetCard} aria-label={`${room.name} — ${room.code}`}>
                <div className={styles.examSetCardHeader}>
                  <span className={styles.examSetCardIcon} aria-hidden="true">
                    <FileText size={18} />
                  </span>
                  <span>{room.code}</span>
                  {score ? (
                    <span
                      className={`${styles.statusBadge} ${styles.statusDone}`}
                      aria-label={`Đã làm, điểm cao nhất ${formatBestScore(score.bestScore)} trên ${formatMaxScore(score.maxScore)}`}
                    >
                      <CheckCircle2 size={13} aria-hidden="true" />
                      Đã làm
                    </span>
                  ) : (
                    <span className={`${styles.statusBadge} ${styles.statusTodo}`}>
                      Chưa làm
                    </span>
                  )}
                </div>
                <h2>{room.name}</h2>
                <p>{room.blueprintName ?? 'Phòng thi được lấy trực tiếp từ Supabase.'}</p>

                {score ? (
                  <div className={styles.scoreRow}>
                    <span className={styles.scoreBadge}>
                      <strong>{formatBestScore(score.bestScore)}</strong>
                      <span className={styles.scoreMax}>/ {formatMaxScore(score.maxScore)}</span>
                    </span>
                    <span className={styles.scoreMeta}>
                      Đã làm · {score.attempts} lượt
                    </span>
                    <Link
                      className={styles.reviewLink}
                      href={`/result/${score.bestSessionId}`}
                    >
                      Xem lại
                    </Link>
                  </div>
                ) : null}

                <div className={styles.examSetStats} aria-label="Thông tin phòng">
                  <span>{room.durationMinutes} phút</span>
                  <span>{room.totalAttemptsDefault} lượt/key</span>
                  <span>{formatPriceVnd(room.priceVnd)}</span>
                </div>
                <RoomLeaderboard roomId={room.id} />
                <div className={styles.roomFoot}>
                  <button
                    className="btn"
                    type="button"
                    onClick={() => {
                      selectExamSet(room.subjectCode, room.id);
                      router.push(`/join/${room.id}`, { transitionTypes: ['nav-forward'] });
                    }}
                  >
                    Chọn phòng này
                  </button>
                </div>
              </article>
            );
          })}
        </section>
      </main>
    </div>
  );
}
