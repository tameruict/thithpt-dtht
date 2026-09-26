'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Clock, FileQuestion, Rocket, ShieldCheck, ShoppingCart } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { startExamSession, type ExamBankDetail } from '@/lib/supabase/exam-data';
import { useExamStore } from '@/store/useExamStore';
import { showToast } from '@/components/ui/Toast';
import StudentNav from '@/components/ui/StudentNav';
import styles from '@/styles/de-thi.module.css';

function startErrorMessage(hint: string | undefined, fallback?: string) {
  switch (hint) {
    case 'NOT_AUTHENTICATED':
      return 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.';
    case 'EXAM_NOT_AVAILABLE':
      return 'Đề thi này hiện không khả dụng. Vui lòng chọn đề khác.';
    case 'UPGRADE_REQUIRED':
      return 'Đề thi này chỉ dành cho tài khoản VIP.';
    case 'SESSION_ALREADY_EXISTS':
    case 'SESSION_ALREADY_ACTIVE':
      return 'Bạn đang có một bài thi khác chưa hoàn thành. Hãy hoàn thành hoặc chờ hết giờ rồi quay lại.';
    default:
      return fallback || 'Không thể bắt đầu bài thi. Vui lòng thử lại.';
  }
}

export default function ExamDetailClient({
  examId,
  initialExam,
}: {
  examId: string;
  initialExam: ExamBankDetail | null;
}) {
  const router = useRouter();
  const setSession = useExamStore((state) => state.setSession);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState('');
  const [needsUpgrade, setNeedsUpgrade] = useState(false);

  if (!initialExam) {
    return (
      <div className={styles.page}>
        <StudentNav />
        <div className={styles.wrap}>
          <div className={styles.emptyState}>
            <p>Không tìm thấy đề thi này, có thể đề đã bị gỡ khỏi ngân hàng đề.</p>
            <Link href="/de-thi" className="btn outline small">
              <ArrowLeft size={16} aria-hidden="true" /> Về ngân hàng đề thi
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const exam = initialExam;

  const handleStart = async () => {
    setStarting(true);
    setError('');
    setNeedsUpgrade(false);
    try {
      const supabase = createClient();
      const { sessionId } = await startExamSession(supabase, examId);
      setSession(sessionId, exam.code);
      router.push(`/exam/${sessionId}`, { transitionTypes: ['nav-forward'] });
    } catch (startError) {
      const hint = startError instanceof Error ? startError.message.trim() : undefined;
      const message = startErrorMessage(hint, hint);
      setError(message);
      showToast(message, 'error');
      if (hint === 'UPGRADE_REQUIRED') setNeedsUpgrade(true);
      setStarting(false);
    }
  };

  return (
    <div className={styles.page}>
      <StudentNav />
      <div className={styles.wrap}>
        <button
          type="button"
          className="btn outline small"
          onClick={() => router.back()}
          aria-label="Quay lại trang trước"
          style={{ marginBottom: 16 }}
        >
          <ArrowLeft size={16} aria-hidden="true" /> Quay lại
        </button>

        <main id="main" tabIndex={-1} className={styles.detailCard} aria-labelledby="exam-detail-title">
          <div className={styles.cardTop}>
            <span className={styles.subjectTag}>{exam.subjectName}</span>
            <span className={`${styles.statusBadge} ${exam.isFree ? styles.free : styles.vip}`}>
              {exam.isFree ? 'Miễn phí' : 'VIP'}
            </span>
          </div>
          <h1 id="exam-detail-title">{exam.title}</h1>
          <p style={{ margin: 0, color: 'var(--muted)', fontSize: 14 }}>
            Mã đề {exam.code} · Năm {exam.year}
            {exam.round ? ` · Đợt ${exam.round}` : ''}
          </p>

          <dl className={styles.detailStats} aria-label="Thông tin đề thi">
            <div>
              <dt>Số câu</dt>
              <dd>
                <FileQuestion size={16} aria-hidden="true" style={{ verticalAlign: -3 }} /> {exam.questionCount}
              </dd>
            </div>
            <div>
              <dt>Thời gian</dt>
              <dd>
                <Clock size={16} aria-hidden="true" style={{ verticalAlign: -3 }} /> {exam.durationMinutes} phút
              </dd>
            </div>
            <div>
              <dt>Đáp án chính thức</dt>
              <dd>
                <ShieldCheck size={16} aria-hidden="true" style={{ verticalAlign: -3 }} />{' '}
                {exam.hasOfficialKey ? 'Có' : 'Chưa có'}
              </dd>
            </div>
          </dl>

          <div aria-live="assertive">
            {error && !needsUpgrade ? (
              <p className={styles.error} role="alert">
                {error}
              </p>
            ) : null}
          </div>

          {needsUpgrade ? (
            <div className={styles.upgradeBox} role="alert">
              <p>{error || 'Đề thi này chỉ dành cho tài khoản VIP.'}</p>
              <Link href="/purchase" className="btn small">
                <ShoppingCart size={16} aria-hidden="true" /> Nâng cấp VIP
              </Link>
            </div>
          ) : (
            <div className={styles.startRow}>
              <button type="button" className="btn" onClick={handleStart} disabled={starting}>
                <Rocket size={18} aria-hidden="true" /> {starting ? 'Đang tạo phiên...' : 'Làm bài'}
              </button>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
