'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import styles from '@/styles/auth.module.css';
import { useExamStore } from '@/store/useExamStore';
import { createClient } from '@/lib/supabase/client';
import { hasSupabaseEnv } from '@/lib/supabase/env';
import StudentNav from '@/components/ui/StudentNav';
import { fetchExamRoomById, startFreeExamSession, type ExamRoomSummary } from '@/lib/supabase/exam-data';

function rpcErrorMessage(message?: string) {
  const known: Record<string, string> = {
    ROOM_NOT_AVAILABLE: 'Phòng thi hiện không mở.',
    ROOM_NOT_READY: 'Phòng thi chưa sẵn sàng. Vui lòng thử lại sau.',
    PAPER_NOT_AVAILABLE: 'Phòng thi chưa có đề được xuất bản.',
    PAPER_HAS_NO_QUESTIONS: 'Đề thi chưa có câu hỏi để bắt đầu.',
    QUESTION_CONTENT_NEEDS_REVIEW: 'Phòng thi đang được rà soát nội dung.',
    EXAM_ROOM_QUESTION_CONTENT_NEEDS_REVIEW: 'Phòng thi đang được rà soát nội dung.',
    SESSION_ALREADY_ACTIVE: 'Bạn đang có một bài thi khác chưa hoàn thành.',
    NOT_AUTHENTICATED: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.',
  };
  return (message && known[message.trim()]) || message || 'Không thể bắt đầu bài thi.';
}

export default function RoomKeyPage({ roomId }: { roomId?: string }) {
  const hasConfiguredSupabase = hasSupabaseEnv();
  const selectedExamSetId = useExamStore((state) => state.selectedExamSetId);
  const selectExamSet = useExamStore((state) => state.selectExamSet);
  const router = useRouter();
  const effectiveRoomId = roomId ?? selectedExamSetId;
  const [selectedRoom, setSelectedRoom] = useState<ExamRoomSummary | null>(null);
  const [isLoadingRoom, setIsLoadingRoom] = useState(hasConfiguredSupabase);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!effectiveRoomId) {
      router.replace('/subjects');
      return;
    }
    if (!hasConfiguredSupabase) return;
    let mounted = true;
    fetchExamRoomById(createClient(), effectiveRoomId)
      .then((room) => {
        if (!mounted) return;
        if (!room) {
          setError('Phòng thi đã chọn không còn tồn tại.');
          return;
        }
        setSelectedRoom(room);
        if (roomId) selectExamSet(room.subjectCode, room.id);
      })
      .catch((e: unknown) => mounted && setError(e instanceof Error ? e.message : 'Không thể tải phòng thi.'))
      .finally(() => mounted && setIsLoadingRoom(false));
    return () => { mounted = false; };
  }, [effectiveRoomId, hasConfiguredSupabase, roomId, router, selectExamSet]);

  const handleStart = async () => {
    if (!selectedRoom || !effectiveRoomId) return;
    setIsSubmitting(true);
    setError('');
    try {
      const { data: sessionId, error: rpcError } = await createClient().rpc('start_free_exam_session', {
        p_subject_code: selectedRoom.subjectCode,
        p_exam_room_id: effectiveRoomId,
      });
      if (rpcError) {
        setError(rpcErrorMessage(rpcError.message));
        return;
      }
      if (!sessionId) {
        setError('Không thể tạo phiên thi. Vui lòng thử lại.');
        return;
      }
      useExamStore.getState().setSession(sessionId as string, 'FREE');
      router.push(`/exam/${sessionId}`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Lỗi kết nối máy chủ.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const isReady = Boolean(selectedRoom);
  return (
    <div className={`${styles.container} ${styles.withStudentNav}`}>
      <StudentNav />
      <header className={styles.topbar}><div className={styles.topbarInner}><span className={styles.crest} aria-hidden="true">THPT</span><div><p className={styles.brandTitle}>Kỳ thi tốt nghiệp THPT Quốc gia</p><p className={styles.brandSub}>Vào phòng thi miễn phí</p></div></div></header>
      <div className={styles.main}>
        <section className={styles.heroPanel} aria-labelledby="free-exam-title">
          <span className={styles.heroKicker}>Học tập không giới hạn</span>
          <h1 id="free-exam-title" className={styles.heroTitle}>Sẵn sàng làm bài?</h1>
          <p className={styles.heroText}>Bạn có thể bắt đầu ngay, không cần key và không mất lượt. Kết quả được lưu vào lịch sử cá nhân.</p>
          <ol className={styles.steps}><li className={styles.step}><span className={styles.stepNum}>1</span><div><strong>Chọn phòng thi</strong><span>Kiểm tra đúng môn và ca thi.</span></div></li><li className={styles.step}><span className={styles.stepNum}>2</span><div><strong>Bắt đầu miễn phí</strong><span>Không yêu cầu mã phòng thi.</span></div></li><li className={styles.step}><span className={styles.stepNum}>3</span><div><strong>Làm bài và xem điểm</strong><span>Thời gian tính từ máy chủ.</span></div></li></ol>
        </section>
        <main id="main" tabIndex={-1} className={styles.card} aria-labelledby="roomkey-title">
          <h1 id="roomkey-title" className={styles.title}>Vào phòng thi miễn phí</h1>
          <p className={styles.subtitle}>Không cần nhập key. Chỉ cần đăng nhập là bạn có thể bắt đầu.</p>
          <div className={styles.readinessRow} role="status"><span className={`${styles.badge} ${isReady ? styles.badgeReady : styles.badgeWarn}`}><span className={styles.badgeDot} />{isLoadingRoom ? 'Đang kiểm tra phòng…' : isReady ? 'Phòng sẵn sàng' : 'Chưa chọn được phòng'}</span></div>
          {selectedRoom && <div className={styles.selectionSummary}><span>{selectedRoom.subjectName}</span><strong>{selectedRoom.name}</strong><small>{selectedRoom.code} · {selectedRoom.durationMinutes} phút · Miễn phí</small></div>}
          {error && <p className={styles.errorText} role="alert">{rpcErrorMessage(error)}</p>}
          <button type="button" className={styles.submitBtn} disabled={isLoadingRoom || isSubmitting || !selectedRoom} onClick={handleStart}>{isSubmitting ? 'Đang vào phòng…' : 'Bắt đầu thi miễn phí'}</button>
          <div className={`${styles.footerLinks} ${styles.centered}`}><Link href="/subjects" className={styles.forgotLink}>← Quay lại chọn môn và phòng thi</Link></div>
        </main>
      </div>
    </div>
  );
}
