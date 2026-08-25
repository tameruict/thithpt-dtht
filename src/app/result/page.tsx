'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Moon, Sun, Clock, BookOpen, Award, ChevronDown, ChevronUp } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import {
  fetchSessionReview,
  getSupabaseErrorMessage,
  questionTypeLabel,
  type SessionReview,
  type SessionReviewQuestion,
  type SessionReviewAnswer,
  type ExamQuestionType,
} from '@/lib/supabase/exam-data';
import { useExamStore } from '@/store/useExamStore';
import QuestionRenderer from '@/components/question/QuestionRenderer';
import type { RenderableQuestion } from '@/components/question/QuestionRenderer';
import { formatHanoiDateTime } from '@/lib/datetime';
import styles from '@/styles/result.module.css';

/* ─── Types ──────────────────────────────────────────── */
type ReviewFilter = 'all' | 'correct' | 'wrong' | 'unanswered';

type QuestionReviewItem = {
  question: SessionReviewQuestion;
  answer: SessionReviewAnswer;
  status: 'correct' | 'wrong' | 'unanswered';
  earnedPoints: number;
  maxPoints: number;
};

type TypeBreakdown = {
  type: ExamQuestionType;
  label: string;
  earned: number;
  max: number;
  correct: number;
  wrong: number;
  unanswered: number;
  total: number;
};

/* ─── SVG Donut Chart ────────────────────────────────── */
function ScoreDonut({ percent, score10 }: { percent: number; score10: string }) {
  const r = 72;
  const circumference = 2 * Math.PI * r;
  const [offset, setOffset] = useState(circumference);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setOffset(circumference - (percent / 100) * circumference);
    }, 120);
    return () => clearTimeout(timeout);
  }, [circumference, percent]);

  return (
    <div className={styles.donutWrap}>
      <svg viewBox="0 0 180 180">
        <defs>
          <linearGradient id="scoreGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="var(--primary)" />
            <stop offset="100%" stopColor="var(--accent)" />
          </linearGradient>
        </defs>
        <circle className={styles.donutTrack} cx="90" cy="90" r={r} />
        <circle
          className={styles.donutValue}
          cx="90"
          cy="90"
          r={r}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      <div className={styles.donutCenter}>
        <span className={styles.donutScore}>{score10}</span>
        <span className={styles.donutLabel}>/ 10 điểm</span>
      </div>
    </div>
  );
}

/* ─── Helpers ────────────────────────────────────────── */
function formatDuration(startedAt: string, submittedAt: string | null): string {
  if (!submittedAt) return 'Chưa nộp bài';
  const startMs = new Date(startedAt).getTime();
  const endMs = new Date(submittedAt).getTime();
  const diffSeconds = Math.max(0, Math.floor((endMs - startMs) / 1000));
  const hours = Math.floor(diffSeconds / 3600);
  const minutes = Math.floor((diffSeconds % 3600) / 60);
  const seconds = diffSeconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  if (minutes > 0) return `${minutes} phút ${seconds} giây`;
  return `${seconds} giây`;
}

function hasMeaningfulAnswer(answer: SessionReviewAnswer): boolean {
  if (!answer) return false;
  if (answer.selectedOptionId) return true;
  if (answer.shortAnswerText && answer.shortAnswerText.trim()) return true;
  if (
    answer.answerJson &&
    typeof answer.answerJson === 'object' &&
    'items' in answer.answerJson
  ) {
    const items = (answer.answerJson as { items?: Record<string, unknown> }).items;
    return Boolean(items && Object.keys(items).length > 0);
  }
  return false;
}

function buildReviewItems(questions: SessionReviewQuestion[]): QuestionReviewItem[] {
  return questions.map((question) => {
    const answer = question.answer;
    let status: 'correct' | 'wrong' | 'unanswered' = 'unanswered';

    if (hasMeaningfulAnswer(answer)) {
      if (answer?.isCorrect === true) status = 'correct';
      else if (answer?.isCorrect === false) status = 'wrong';
      else status = 'wrong'; // có làm nhưng không đúng / chờ chấm tay
    }

    return {
      question,
      answer,
      status,
      earnedPoints: answer?.earnedPoints ?? 0,
      maxPoints: question.maxPoints,
    };
  });
}

function buildTypeBreakdowns(items: QuestionReviewItem[]): TypeBreakdown[] {
  const map = new Map<ExamQuestionType, TypeBreakdown>();
  for (const item of items) {
    const type = item.question.type;
    if (!map.has(type)) {
      map.set(type, {
        type,
        label: questionTypeLabel(type),
        earned: 0,
        max: 0,
        correct: 0,
        wrong: 0,
        unanswered: 0,
        total: 0,
      });
    }
    const b = map.get(type)!;
    b.earned += item.earnedPoints;
    b.max += item.maxPoints;
    b.total += 1;
    if (item.status === 'correct') b.correct += 1;
    else if (item.status === 'wrong') b.wrong += 1;
    else b.unanswered += 1;
  }
  const order: ExamQuestionType[] = ['multiple_choice', 'true_false', 'short_answer', 'essay'];
  return order.filter((t) => map.has(t)).map((t) => map.get(t)!);
}

function toRenderableQuestion(q: SessionReviewQuestion): RenderableQuestion {
  return {
    id: q.id,
    displayNo: q.displayNo,
    type: q.type,
    content: q.content,
    imageUrl: q.imageUrl,
    imageAltText: q.imageAltText,
    imageWidth: q.imageWidth,
    imageHeight: q.imageHeight,
    options: q.options.map((o) => ({
      id: o.id,
      label: o.label,
      content: o.content,
      imageUrl: o.imageUrl,
      imageAltText: o.imageAltText,
      imageWidth: o.imageWidth,
      imageHeight: o.imageHeight,
      correct: o.correct,
    })),
    trueFalseItems: q.trueFalseItems.map((t) => ({
      id: t.id,
      label: t.label,
      content: t.content,
      correct: t.correctValue ?? undefined,
    })),
    maxPoints: q.maxPoints,
  };
}

function readTfItems(answer: SessionReviewAnswer): Record<string, string> {
  if (
    answer?.answerJson &&
    typeof answer.answerJson === 'object' &&
    'items' in answer.answerJson
  ) {
    return (
      (answer.answerJson as { items?: Record<string, string> }).items ?? {}
    );
  }
  return {};
}

function getStudentAnswerLabel(
  question: SessionReviewQuestion,
  answer: SessionReviewAnswer,
): string {
  if (!hasMeaningfulAnswer(answer)) return 'Không trả lời';

  if (question.type === 'multiple_choice') {
    const option = question.options.find((o) => o.id === answer?.selectedOptionId);
    return option ? `${option.label}. ${option.content}` : 'Không xác định';
  }

  if (question.type === 'true_false') {
    const items = readTfItems(answer);
    const parts = question.trueFalseItems.map((item) => {
      const val = items[item.id];
      const label = item.label ? `${item.label}) ` : '';
      return `${label}${val === 'true' ? 'Đúng' : val === 'false' ? 'Sai' : '—'}`;
    });
    return parts.join('; ');
  }

  if (question.type === 'short_answer' || question.type === 'essay') {
    return answer?.shortAnswerText || 'Không trả lời';
  }

  return 'Không trả lời';
}

function getCorrectAnswerLabel(question: SessionReviewQuestion): string {
  if (question.type === 'multiple_choice') {
    const correct = question.options.filter((o) => o.correct);
    if (correct.length === 0) return '—';
    return correct.map((o) => `${o.label}. ${o.content}`).join('; ');
  }

  if (question.type === 'true_false') {
    return question.trueFalseItems
      .map((item) => {
        const label = item.label ? `${item.label}) ` : '';
        return `${label}${item.correctValue === true ? 'Đúng' : item.correctValue === false ? 'Sai' : '—'}`;
      })
      .join('; ');
  }

  if (question.type === 'short_answer') {
    const keys = question.shortAnswerKeys
      .map((k) => k.display)
      .filter((v): v is string => Boolean(v));
    return keys.length > 0 ? keys.join(' hoặc ') : '—';
  }

  return '—';
}

/* ─── Component ──────────────────────────────────────── */
export default function ResultPage({ sessionId }: { sessionId?: string }) {
  const router = useRouter();
  const {
    hasHydrated,
    theme,
    setTheme,
    finishSession,
    clearDraft,
    candidateInfo,
    roomKey,
    currentSessionId: storedSessionId,
  } = useExamStore();
  const currentSessionId = sessionId ?? storedSessionId;
  const supabase = useMemo(() => createClient(), []);
  const [review, setReview] = useState<SessionReview | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isScoring, setIsScoring] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [reviewFilter, setReviewFilter] = useState<ReviewFilter>('all');
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());

  // Kết thúc: không lưu tiến trình làm bài nữa (xóa bản nháp resume).
  useEffect(() => {
    clearDraft();
  }, [clearDraft]);

  useEffect(() => {
    if (hasHydrated && !candidateInfo && !sessionId) {
      router.push('/');
      return;
    }

    if (hasHydrated && (!currentSessionId || (!sessionId && !roomKey))) {
      router.push('/');
    }
  }, [candidateInfo, currentSessionId, hasHydrated, roomKey, router, sessionId]);

  useEffect(() => {
    if (!hasHydrated || !currentSessionId) return;

    let mounted = true;
    const sessionId = currentSessionId;

    const run = async (attempt: number) => {
      try {
        const data = await fetchSessionReview(supabase, sessionId);
        if (!mounted) return;
        setReview(data);
        setLoadError('');

        // Điểm chưa có (đang chấm) -> thử lại tối đa 3 lần, cách 1.5s.
        if (
          data.session.gradingStatus === 'pending_auto' &&
          data.session.score === null &&
          attempt < 3
        ) {
          setIsScoring(true);
          window.setTimeout(() => {
            if (mounted) void run(attempt + 1);
          }, 1500);
        } else {
          setIsScoring(false);
          setIsLoading(false);
        }
      } catch (error: unknown) {
        if (!mounted) return;
        setLoadError(
          getSupabaseErrorMessage(error, 'Không thể tải kết quả từ Supabase.'),
        );
        setIsScoring(false);
        setIsLoading(false);
      }
    };

    void run(0);

    return () => {
      mounted = false;
    };
  }, [currentSessionId, hasHydrated, supabase]);

  const isPractice = (review?.session.roomCode ?? '')
    .toUpperCase()
    .startsWith('PRACTICE');

  /* ─── Derived data ──────────────────────────────────── */
  const reviewItems = useMemo(
    () => (review ? buildReviewItems(review.questions) : []),
    [review],
  );

  const resultStats = useMemo(() => {
    const total = reviewItems.length;
    const correctAnswers = reviewItems.filter((i) => i.status === 'correct').length;
    const wrongAnswers = reviewItems.filter((i) => i.status === 'wrong').length;
    const empty = reviewItems.filter((i) => i.status === 'unanswered').length;
    const answered = total - empty;
    return { total, answered, correctAnswers, wrongAnswers, empty };
  }, [reviewItems]);

  const typeBreakdowns = useMemo(
    () => buildTypeBreakdowns(reviewItems),
    [reviewItems],
  );

  const filteredReviewItems = useMemo(() => {
    if (reviewFilter === 'all') return reviewItems;
    return reviewItems.filter((i) => i.status === reviewFilter);
  }, [reviewItems, reviewFilter]);

  const score = review?.session.score ?? null;
  const maxScore = review?.session.maxScore ?? 10;
  const score10 =
    typeof score === 'number' && maxScore > 0
      ? ((score / maxScore) * 10).toFixed(2)
      : '—';
  const progressPercent =
    typeof score === 'number' && maxScore > 0 ? (score / maxScore) * 100 : 0;
  const subjectName = review?.session.subjectName ?? 'Môn thi';
  const examRoomName = review?.session.roomName ?? 'Phòng thi';
  const timeTaken = review
    ? formatDuration(review.session.startedAt, review.session.submittedAt)
    : '';

  const toggleExpand = (id: string) => {
    setExpandedItems((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleFinish = () => {
    finishSession();
    router.push('/subjects');
  };

  if (!hasHydrated || (!candidateInfo && !sessionId)) return null;

  return (
    <div className={styles.screen}>
      <div className={styles.pageTools}>
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
      </div>
      <h1 className={styles.title}>KẾT QUẢ PHIÊN THI</h1>
      <div className={styles.center}>
        <div className={styles.mainLayout}>
          {/* ─── Loading / Error card ─── */}
          {(isLoading || loadError) && (
            <section className={styles.card}>
              <h2>Kết quả từ cơ sở dữ liệu</h2>
              <div className={styles.body}>
                {isLoading && (
                  <p className={styles.successMessage}>
                    {isScoring
                      ? 'Đang chấm điểm…'
                      : 'Đang tải kết quả từ Supabase...'}
                  </p>
                )}
                {loadError && <p className={styles.errorText}>{loadError}</p>}
              </div>
            </section>
          )}

          {/* ─── Main result display ─── */}
          {!isLoading && !loadError && review && (
            <>
              {/* Score Hero Card */}
              <section className={styles.card}>
                <h2>
                  {subjectName} — {examRoomName}
                </h2>
                {review.session.gradingStatus === 'pending_manual' && (
                  <p className={styles.pendingNotice} role="status" aria-live="polite">
                    Điểm hiện tại là điểm tự động tạm tính. Bài còn chờ admin chấm
                    phần tự luận.
                  </p>
                )}
                {review.session.gradingStatus === 'failed' && (
                  <p className={styles.gradingError} role="alert">
                    Hệ thống chưa hoàn tất chấm tự động. Phiên đã được đưa vào hàng
                    đợi phục hồi.
                  </p>
                )}
                <div className={styles.scoreHero}>
                  <ScoreDonut percent={progressPercent} score10={score10} />
                  <div className={styles.heroDetails}>
                    <div className={styles.heroRow}>
                      <span className={`${styles.heroDot} ${styles.heroDotCorrect}`} />
                      <span>
                        Đúng: <strong>{resultStats.correctAnswers}</strong>
                      </span>
                    </div>
                    <div className={styles.heroRow}>
                      <span className={`${styles.heroDot} ${styles.heroDotWrong}`} />
                      <span>
                        Sai: <strong>{resultStats.wrongAnswers}</strong>
                      </span>
                    </div>
                    <div className={styles.heroRow}>
                      <span className={`${styles.heroDot} ${styles.heroDotEmpty}`} />
                      <span>
                        Bỏ trống: <strong>{resultStats.empty}</strong>
                      </span>
                    </div>
                    <div className={styles.heroRow}>
                      <span>
                        Tổng điểm:{' '}
                        <strong>
                          {typeof score === 'number'
                            ? `${score.toFixed(2)} / ${maxScore}`
                            : 'Đang chấm…'}
                        </strong>
                      </span>
                    </div>
                  </div>
                </div>

                {/* Meta tags */}
                <div className={styles.metaBar}>
                  <span className={styles.metaTag}>
                    <Clock size={14} />
                    Thời gian: {timeTaken}
                  </span>
                  <span className={styles.metaTag}>
                    <BookOpen size={14} />
                    {resultStats.answered} / {resultStats.total} câu đã trả lời
                  </span>
                  <span className={styles.metaTag}>
                    <Award size={14} />
                    Lần thi thứ {review.session.attemptNumber}
                  </span>
                  {review.session.submittedAt ? (
                    <span className={styles.metaTag}>
                      <Clock size={14} />
                      Nộp lúc: {formatHanoiDateTime(review.session.submittedAt)}
                    </span>
                  ) : null}
                </div>
              </section>

              {/* Score Breakdown by Type */}
              {typeBreakdowns.length > 0 && (
                <section className={styles.card}>
                  <h2>Phân tích điểm theo dạng câu hỏi</h2>
                  <div className={styles.breakdownGrid}>
                    {typeBreakdowns.map((b) => {
                      const pct = b.max > 0 ? (b.earned / b.max) * 100 : 0;
                      return (
                        <div key={b.type} className={styles.breakdownItem}>
                          <div className={styles.breakdownType}>{b.label}</div>
                          <div className={styles.breakdownScore}>
                            {b.earned.toFixed(1)} <span>/ {b.max.toFixed(1)} điểm</span>
                          </div>
                          <div className={styles.breakdownBar}>
                            <div
                              className={styles.breakdownBarFill}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <div className={styles.breakdownCount}>
                            {b.correct} đúng · {b.wrong} sai · {b.unanswered} bỏ trống — {b.total} câu
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}

              {/* Detailed Answer Review — ẩn với phòng luyện tập (PRACTICE) */}
              {isPractice ? (
                <section className={styles.card}>
                  <h3 className={styles.reviewTitle}>Xem lại bài làm</h3>
                  <p style={{ color: 'var(--muted)', fontWeight: 600 }}>
                    Phòng luyện tập không hiển thị đáp án chi tiết để bạn tự ôn lại.
                  </p>
                </section>
              ) : (
                <section className={styles.card}>
                  <div className={styles.reviewHeader}>
                    <h3 className={styles.reviewTitle}>Xem lại bài làm &amp; đáp án</h3>
                    <div className={styles.reviewFilter}>
                      {(
                        [
                          ['all', 'Tất cả'],
                          ['correct', 'Đúng'],
                          ['wrong', 'Sai'],
                          ['unanswered', 'Bỏ trống'],
                        ] as [ReviewFilter, string][]
                      ).map(([value, label]) => (
                        <button
                          key={value}
                          type="button"
                          className={`${styles.filterBtn} ${
                            reviewFilter === value ? styles.filterBtnActive : ''
                          }`}
                          onClick={() => setReviewFilter(value)}
                        >
                          {label}
                          {value !== 'all' && (
                            <>
                              {' '}
                              (
                              {value === 'correct'
                                ? resultStats.correctAnswers
                                : value === 'wrong'
                                  ? resultStats.wrongAnswers
                                  : resultStats.empty}
                              )
                            </>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className={styles.reviewList}>
                    {filteredReviewItems.length === 0 && (
                      <p style={{ textAlign: 'center', color: 'var(--muted)', fontWeight: 700 }}>
                        Không có câu hỏi nào ở bộ lọc này.
                      </p>
                    )}
                    {filteredReviewItems.map((item) => {
                      const isExpanded = expandedItems.has(item.question.id);
                      const statusClass =
                        item.status === 'correct'
                          ? styles.reviewItemCorrect
                          : item.status === 'wrong'
                            ? styles.reviewItemWrong
                            : styles.reviewItemUnanswered;

                      return (
                        <div
                          key={item.question.id}
                          className={`${styles.reviewItem} ${statusClass}`}
                        >
                          <button
                            type="button"
                            className={styles.reviewItemHead}
                            onClick={() => toggleExpand(item.question.id)}
                            style={{ cursor: 'pointer', width: '100%', border: 'none', background: 'inherit' }}
                          >
                            <span className={styles.reviewItemNo}>
                              Câu {item.question.displayNo} — {questionTypeLabel(item.question.type)}
                            </span>
                            <div className={styles.reviewItemBadges}>
                              <span
                                className={`${styles.badge} ${
                                  item.status === 'correct'
                                    ? styles.badgeCorrect
                                    : item.status === 'wrong'
                                      ? styles.badgeWrong
                                      : styles.badgeUnanswered
                                }`}
                              >
                                {item.status === 'correct'
                                  ? '✓ Đúng'
                                  : item.status === 'wrong'
                                    ? '✗ Sai'
                                    : '— Chưa trả lời'}
                              </span>
                              <span className={`${styles.badge} ${styles.badgePoints}`}>
                                {item.earnedPoints.toFixed(1)} / {item.maxPoints.toFixed(1)} đ
                              </span>
                              {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                            </div>
                          </button>

                          {isExpanded && (
                            <div className={styles.reviewItemBody}>
                              <QuestionRenderer
                                question={toRenderableQuestion(item.question)}
                                selectedOptionId={item.answer?.selectedOptionId ?? undefined}
                                textValue={item.answer?.shortAnswerText ?? ''}
                                showSolutions
                              />
                              <div className={styles.answerCompare}>
                                <div className={`${styles.answerRow} ${styles.answerRowStudent}`}>
                                  <span className={styles.answerLabel}>Bạn chọn:</span>
                                  <span className={styles.answerValue}>
                                    {getStudentAnswerLabel(item.question, item.answer)}
                                  </span>
                                </div>
                                <div className={`${styles.answerRow} ${styles.answerRowCorrect}`}>
                                  <span className={styles.answerLabel}>Đáp án:</span>
                                  <span className={styles.answerValue}>
                                    {getCorrectAnswerLabel(item.question)}
                                  </span>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}

              {/* Finish button */}
              <div className={styles.actions}>
                <button className="btn" type="button" onClick={handleFinish}>
                  Hoàn thành
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
