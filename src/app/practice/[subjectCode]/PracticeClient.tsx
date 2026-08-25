'use client';

import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, BookOpenCheck, Play } from 'lucide-react';
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

const QUESTION_COUNTS = [10, 20, 30, 40] as const;

export default function PracticeClient({ subjectCode }: { subjectCode: string }) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const setSession = useExamStore((state) => state.setSession);
  const [practice, setPractice] = useState<PracticeAvailability | null>(null);
  const [attemptBalance, setAttemptBalance] = useState(0);
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
        setAttemptBalance(dashboard.attemptBalance);
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
      <header className={styles.header}>
        <button type="button" className="btn outline" onClick={() => router.back()}>
          <ArrowLeft size={16} /> Quay lại
        </button>
        <span className={styles.badge}><BookOpenCheck size={16} /> Tự luyện</span>
      </header>

      <section className={styles.card} aria-busy={loading}>
        <h1>Tự luyện {practice?.subjectName ?? subjectCode}</h1>
        <p>
          Hệ thống tự chọn câu đã duyệt trên máy chủ. Client không thể gửi danh sách
          mã câu hỏi tùy ý.
        </p>

        <dl className={styles.stats}>
          <div><dt>Số lượt hiện có</dt><dd>{attemptBalance}</dd></div>
          <div><dt>Chi phí mỗi phiên</dt><dd>{practice?.attemptCost ?? 3}</dd></div>
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

        {error && <p className={styles.error} role="alert" aria-live="assertive">{error}</p>}
        {!loading && !practice?.available && !error && (
          <p className={styles.error} role="status">
            Môn này chưa có phòng tự luyện sẵn sàng.
          </p>
        )}

        <button
          type="button"
          className="btn"
          disabled={
            loading ||
            starting ||
            !practice?.available ||
            attemptBalance < (practice?.attemptCost ?? 3)
          }
          onClick={handleStart}
        >
          <Play size={17} /> {starting ? 'Đang tạo phiên...' : 'Bắt đầu tự luyện'}
        </button>
      </section>
    </div>
  );
}
