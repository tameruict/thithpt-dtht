'use client';

import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, BookOpenCheck, Play } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import {
  fetchSubjectsDashboard,
  getSupabaseErrorMessage,
  startPracticeSession,
  type PracticeAvailability,
} from '@/lib/supabase/exam-data';
import { useExamStore } from '@/store/useExamStore';
import styles from '@/styles/practice.module.css';
import StudentNav from '@/components/ui/StudentNav';

const QUESTION_COUNTS = [10, 20, 30, 40] as const;

export default function PracticeClient({ subjectCode }: { subjectCode: string }) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const setSession = useExamStore((state) => state.setSession);
  const [practice, setPractice] = useState<PracticeAvailability | null>(null);
  const [questionCount, setQuestionCount] = useState<number>(20);
  const [difficulties, setDifficulties] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let mounted = true;
    fetchSubjectsDashboard(supabase)
      .then((dashboard) => {
        if (!mounted) return;
        setPractice(
          dashboard.practice.find((item) => item.subjectCode === subjectCode) ?? null,
        );
      })
      .catch((loadError: unknown) => {
        if (mounted) {
          setError(
            getSupabaseErrorMessage(loadError, 'Không tải được cấu hình tự luyện.'),
          );
        }
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [subjectCode, supabase]);

  const toggleDifficulty = (difficulty: number) => {
    setDifficulties((current) =>
      current.includes(difficulty)
        ? current.filter((value) => value !== difficulty)
        : [...current, difficulty],
    );
  };

  const handleStart = async () => {
    if (!practice?.available) return;
    setStarting(true);
    setError('');
    try {
      const sessionId = await startPracticeSession(supabase, {
        subjectCode,
        questionCount,
        difficulties,
      });
      setSession(sessionId, 'PRACTICE');
      router.push(`/exam/${sessionId}`, { transitionTypes: ['nav-forward'] });
    } catch (startError) {
      setError(
        getSupabaseErrorMessage(startError, 'Không thể bắt đầu phiên tự luyện.'),
      );
      setStarting(false);
    }
  };

  return (
    <div className={styles.page}>
      <StudentNav />
      <header className={styles.header}>
        <button type="button" className="btn outline small" onClick={() => router.back()} aria-label="Quay lại trang trước">
          <ArrowLeft size={16} aria-hidden="true" /> Quay lại
        </button>
        <span className={styles.badge}><BookOpenCheck size={16} aria-hidden="true" /> Tự luyện · không tính điểm thi</span>
      </header>

      <main id="main" tabIndex={-1} className={styles.card} aria-labelledby="practice-title" aria-busy={loading}>
        <h1 id="practice-title">Tự luyện {practice?.subjectName ?? subjectCode}</h1>
        <p>
          Hệ thống tự chọn câu đã duyệt trên máy chủ. Client không thể gửi danh sách
          mã câu hỏi tùy ý.
        </p>
        <p className={styles.practiceNote}>
          Tự luyện hoàn toàn miễn phí và không giới hạn lượt. Điểm chỉ để bạn theo dõi tiến bộ.
        </p>

        <dl className={styles.stats} aria-label="Số liệu tự luyện">
          <div><dt>Quyền truy cập</dt><dd>Miễn phí</dd></div>
          <div><dt>Số lượt</dt><dd>Không giới hạn</dd></div>
          <div><dt>Câu đã duyệt</dt><dd>{practice?.approvedQuestionCount ?? 0}</dd></div>
        </dl>

        <fieldset className={styles.fieldset} disabled={loading || starting}>
          <legend>Số câu</legend>
          <div className={styles.options}>
            {QUESTION_COUNTS.map((count) => (
              <label key={count}>
                <input
                  type="radio"
                  name="questionCount"
                  value={count}
                  checked={questionCount === count}
                  onChange={() => setQuestionCount(count)}
                />
                {count} câu
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className={styles.fieldset} disabled={loading || starting}>
          <legend>Độ khó (để trống = tất cả)</legend>
          <div className={styles.options}>
            {[
              [1, 'Nhận biết'],
              [2, 'Thông hiểu'],
              [3, 'Vận dụng'],
              [4, 'Vận dụng cao'],
            ].map(([value, label]) => (
              <label key={value}>
                <input
                  type="checkbox"
                  checked={difficulties.includes(Number(value))}
                  onChange={() => toggleDifficulty(Number(value))}
                />
                {label}
              </label>
            ))}
          </div>
        </fieldset>

        <div aria-live="assertive">
          {error && <p className={styles.error} role="alert">{error}</p>}
        </div>
        {!loading && !practice?.available && !error && (
          <div className={styles.error} role="status">
            <p>Môn này chưa có phòng tự luyện sẵn sàng.</p>
            <Link className="btn outline small" href="/subjects">Chọn môn khác</Link>
          </div>
        )}

        <div className={styles.startRow}>
          <button
            type="button"
            className="btn"
            disabled={
              loading ||
              starting ||
              !practice?.available
            }
            onClick={handleStart}
          >
            <Play size={17} aria-hidden="true" /> {starting ? 'Đang tạo phiên...' : 'Bắt đầu tự luyện'}
          </button>

        </div>
      </main>
    </div>
  );
}
