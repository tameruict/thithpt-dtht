'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { FileText, KeyRound, LogOut, Moon, ShieldCheck, Sun } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { hasSupabaseEnv } from '@/lib/supabase/env';
import {
  clearReferenceCache,
  fetchSubjectsDashboard,
  formatPriceVnd,
  type ActiveSessionInfo,
  type ExamRoomSummary,
  type PracticeAvailability,
  type SubjectSummary,
} from '@/lib/supabase/exam-data';
import { useExamStore, type CandidateInfo } from '@/store/useExamStore';
import { formatHanoiTime } from '@/lib/datetime';
import styles from '@/styles/subjects.module.css';

const genderLabels: Record<string, string> = {
  male: 'Nam',
  female: 'Nữ',
  other: 'Khác',
};

function formatCandidateDate(value: string) {
  if (!value) return 'Chưa cập nhật';

  const isoDate = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoDate) {
    const [, year, month, day] = isoDate;
    return `${day}/${month}/${year}`;
  }

  return value;
}

function formatCandidateGender(value: string) {
  return genderLabels[value] ?? (value || 'Chưa cập nhật');
}

export default function SubjectsClient({
  initialCandidate,
}: {
  initialCandidate: CandidateInfo;
}) {
  const router = useRouter();
  const hasConfiguredSupabase = hasSupabaseEnv();
  const theme = useExamStore((state) => state.theme);
  const setTheme = useExamStore((state) => state.setTheme);
  const hasHydrated = useExamStore((state) => state.hasHydrated);
  const storedCandidateInfo = useExamStore((state) => state.candidateInfo);
  const candidateInfo = storedCandidateInfo ?? initialCandidate;
  const [activeTab, setActiveTab] = useState<'subjects' | 'rooms'>('subjects');
  const [subjects, setSubjects] = useState<SubjectSummary[]>([]);
  const [rooms, setRooms] = useState<ExamRoomSummary[]>([]);
  const [practice, setPractice] = useState<PracticeAvailability[]>([]);
  const [isLoading, setIsLoading] = useState(hasConfiguredSupabase);
  const [loadError, setLoadError] = useState('');
  const [userRole, setUserRole] = useState<string | null>(null);
  const [activeSession, setActiveSession] = useState<ActiveSessionInfo | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);
  const logout = useExamStore((state) => state.logout);
  const setSession = useExamStore((state) => state.setSession);

  const isAdmin = userRole === 'admin';

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
    if (hasHydrated && !candidateInfo) {
      router.push('/');
    }
  }, [candidateInfo, hasHydrated, router]);

  useEffect(() => {
    if (hasHydrated) return;

    const timeoutId = window.setTimeout(() => {
      router.push('/');
    }, 2500);

    return () => window.clearTimeout(timeoutId);
  }, [hasHydrated, router]);

  useEffect(() => {
    if (!hasHydrated || !candidateInfo) return;

    if (!hasConfiguredSupabase) return;

    let isMounted = true;
    const supabase = createClient();

    // Môn + phòng + role + phiên đang dở: gộp 1 round-trip qua RPC dashboard.
    fetchSubjectsDashboard(supabase)
      .then((dashboard) => {
        if (!isMounted) return;
        setSubjects(dashboard.subjects);
        setRooms(dashboard.rooms);
        setPractice(dashboard.practice);
        setUserRole(dashboard.role);
        setActiveSession(dashboard.activeSession);
        setLoadError('');
      })
      .catch((error: unknown) => {
        if (!isMounted) return;
        const message =
          error instanceof Error
            ? error.message
            : 'Không thể tải dữ liệu từ Supabase.';
        setLoadError(message);
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [candidateInfo, hasConfiguredSupabase, hasHydrated]);

  if (!hasHydrated) {
    return (
      <div className={styles.screen}>
        <div className={styles.main}>
          <div className={styles.emptyState}>Đang tải phiên đăng nhập...</div>
        </div>
      </div>
    );
  }

  if (!candidateInfo) {
    return (
      <div className={styles.screen}>
        <div className={styles.main}>
          <div className={styles.emptyState}>Đang chuyển về màn đăng nhập...</div>
        </div>
      </div>
    );
  }

  const displayDob = formatCandidateDate(candidateInfo.dob);
  const displayGender = formatCandidateGender(candidateInfo.gender);
  const displayLoadError =
    loadError ||
    (!hasConfiguredSupabase
      ? 'Chưa cấu hình Supabase nên không thể tải dữ liệu thi.'
      : '');

  return (
    <div className={styles.screen}>
      <div className={styles.pageTools}>
        <button
          className={`btn outline small ${styles.profileButton}`}
          type="button"
          onClick={() => router.push('/profile', { transitionTypes: ['nav-forward'] })}
        >
          <div className={styles.avatar}>{candidateInfo.name.charAt(0)}</div>
          <span>Profile</span>
        </button>
        <button
          className="btn outline small"
          type="button"
          onClick={() => router.push('/purchase', { transitionTypes: ['nav-forward'] })}
        >
          <KeyRound size={15} />
          <span>Mua key</span>
        </button>
        {isAdmin && (
          <button
            className={`btn outline small ${styles.profileButton}`}
            type="button"
            onClick={() => router.push('/admin', { transitionTypes: ['nav-forward'] })}
          >
            <ShieldCheck size={15} />
            <span>Admin</span>
          </button>
        )}
        <button
          className="theme-toggle"
          type="button"
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

      <div className={styles.main}>
        <h1 className={styles.examTitle}>Kỳ thi tốt nghiệp THPT 2026</h1>

        {activeSession ? (
          <section
            className="card"
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px',
              borderLeft: '4px solid var(--primary)',
              marginBottom: '16px',
            }}
          >
            <div>
              <strong>Bạn có một bài thi đang làm dở</strong>
              <div style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>
                {activeSession.subjectName ?? activeSession.roomName}
                {activeSession.dueAt
                  ? ` · Hết giờ lúc ${formatHanoiTime(activeSession.dueAt)}`
                  : ''}
              </div>
            </div>
            <button
              className="btn"
              type="button"
              onClick={() => {
                setSession(
                  activeSession.sessionId,
                  activeSession.roomCode || 'RESUME',
                );
                router.push(`/exam/${activeSession.sessionId}`, {
                  transitionTypes: ['nav-forward'],
                });
              }}
            >
              Tiếp tục bài thi
            </button>
          </section>
        ) : null}

        <div className={styles.infoGrid}>
          <section className={`card ${styles.infoCard}`}>
            <h2 className="section-title">Thông tin thí sinh</h2>
            <div className={styles.infoRow}>
              <span>Họ và tên:</span>
              <strong>{candidateInfo.name}</strong>
            </div>
            <div className={styles.infoRow}>
              <span>Ngày sinh:</span>
              <span>{displayDob}</span>
            </div>
            <div className={styles.infoRow}>
              <span>SBD:</span>
              <span>{candidateInfo.code}</span>
            </div>
            <div className={styles.infoRow}>
              <span>Giới tính:</span>
              <span>{displayGender}</span>
            </div>
            <div className={styles.infoRow}>
              <span>Ca thi:</span>
              <span>{candidateInfo.session}</span>
            </div>
          </section>

          <section className={`card ${styles.infoCard}`}>
            <h2 className="section-title">Hội đồng thi</h2>
            <div className={styles.infoRow}>
              <span>Hội đồng thi:</span>
              <strong>{candidateInfo.province || 'Chưa cập nhật'}</strong>
            </div>
            <div className={styles.infoRow}>
              <span>Điểm thi:</span>
              <span>{candidateInfo.school || 'Chưa cập nhật'}</span>
            </div>
            <div className={styles.infoRow}>
              <span>Phòng thi:</span>
              <span>Chọn theo key phòng thi</span>
            </div>
          </section>
        </div>

        <section className={`card ${styles.subjectList}`}>
          <div className={styles.tabsContainer}>
            <button
              className={`${styles.tabButton} ${
                activeTab === 'subjects' ? styles.activeTab : ''
              }`}
              type="button"
              onClick={() => setActiveTab('subjects')}
            >
              Danh sách môn thi
            </button>
            <button
              className={`${styles.tabButton} ${
                activeTab === 'rooms' ? styles.activeTab : ''
              }`}
              type="button"
              onClick={() => setActiveTab('rooms')}
            >
              Phòng thi đang mở
            </button>
          </div>

          {displayLoadError ? (
            <div className={styles.emptyState}>{displayLoadError}</div>
          ) : null}

          {activeTab === 'subjects' ? (
            <div className={styles.subjectsGrid}>
              {isLoading ? (
                <div className={styles.emptyState}>Đang tải môn thi từ cơ sở dữ liệu...</div>
              ) : null}
              {!isLoading && subjects.length === 0 && !displayLoadError ? (
                <div className={styles.emptyState}>
                  Cơ sở dữ liệu chưa có môn thi đang hoạt động.
                </div>
              ) : null}
              {subjects.map((subject) => (
                <div key={subject.code} className={styles.subjectItem}>
                  <div>
                    <span className={styles.subjectName}>{subject.name}</span>
                    <span className={styles.subjectMeta}>
                      {subject.openRoomCount} phòng thi đang mở
                    </span>
                  </div>
                  <div className={styles.subjectActions}>
                    {practice.some(
                      (item) => item.subjectCode === subject.code && item.available,
                    ) && (
                      <button
                        className="btn secondary small"
                        type="button"
                        onClick={() =>
                          router.push(`/practice/${subject.code.toLowerCase()}`, {
                            transitionTypes: ['nav-forward'],
                          })
                        }
                      >
                        Tự luyện
                      </button>
                    )}
                    <button
                      className="btn small"
                      type="button"
                      disabled={subject.openRoomCount === 0}
                      onClick={() =>
                        router.push(`/subjects/${subject.code.toLowerCase()}`, {
                          transitionTypes: ['nav-forward'],
                        })
                      }
                    >
                      Vào thi
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className={styles.pricingGrid}>
              {isLoading ? (
                <div className={styles.emptyState}>Đang tải phòng thi từ cơ sở dữ liệu...</div>
              ) : null}
              {!isLoading && rooms.length === 0 && !displayLoadError ? (
                <div className={styles.emptyState}>
                  Cơ sở dữ liệu chưa có phòng thi nào đang mở.
                </div>
              ) : null}
              {rooms.map((room) => (
                <article key={room.id} className={styles.pricingCard}>
                  <div className={styles.pricingTitle}>
                    <FileText size={18} />
                    <span>{room.subjectName}</span>
                  </div>
                  <div className={styles.pricingPrice}>
                    {formatPriceVnd(room.priceVnd)}
                  </div>
                  <div className={styles.pricingDesc}>
                    <strong>{room.name}</strong>
                    <br />
                    {room.durationMinutes} phút · {room.totalAttemptsDefault} lượt/key
                    <br />
                    Mã phòng: {room.code}
                  </div>
                  <button
                    className={styles.buyBtn}
                    type="button"
                    onClick={() =>
                      router.push(`/subjects/${room.subjectCode.toLowerCase()}`, {
                        transitionTypes: ['nav-forward'],
                      })
                    }
                  >
                    <KeyRound size={16} />
                    Chọn phòng thi
                  </button>
                </article>
              ))}
            </div>
          )}
        </section>

        <div className={styles.footer}>
          <button
            className="btn secondary"
            type="button"
            onClick={() => router.push('/', { transitionTypes: ['nav-back'] })}
          >
            Quay lại
          </button>
        </div>
      </div>
    </div>
  );
}
