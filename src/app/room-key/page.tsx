'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { KeyRound } from 'lucide-react';
import styles from '@/styles/auth.module.css';
import { useExamStore } from '@/store/useExamStore';
import { createClient } from '@/lib/supabase/client';
import { hasSupabaseEnv } from '@/lib/supabase/env';
import StudentNav from '@/components/ui/StudentNav';
import {
  fetchExamRoomById,
  formatPriceVnd,
  type ExamRoomSummary,
} from '@/lib/supabase/exam-data';

function keyErrorMessage(hint: string | undefined, fallback?: string) {
  switch (hint) {
    case 'KEY_NOT_FOUND':
      return 'Mã phòng thi không tồn tại.';
    case 'KEY_INVALID_STATUS':
    case 'KEY_REVOKED':
      return 'Mã phòng thi đã bị khóa hoặc đã hết lượt sử dụng.';
    case 'KEY_EXPIRED':
      return 'Mã phòng thi đã hết hạn.';
    case 'KEY_ALREADY_ASSIGNED':
    case 'KEY_ASSIGNED_TO_OTHER':
      return 'Mã phòng thi này đã được gán cho học sinh khác.';
    case 'KEY_EXHAUSTED':
    case 'KEY_NO_ATTEMPTS_LEFT':
      return 'Mã phòng thi này đã sử dụng hết số lượt thi.';
    case 'KEY_SUBJECT_MISMATCH':
      return 'Mã phòng thi không dùng cho môn đã chọn.';
    case 'ROOM_NOT_AVAILABLE':
      return 'Môn thi này chưa có phòng thi đang mở.';
    case 'SUBJECT_REQUIRED':
      return 'Vui lòng chọn môn thi trước khi nhập key.';
    case 'PAPER_NOT_AVAILABLE':
      return 'Phòng thi chưa có đề thi đã xuất bản.';
    case 'PAPER_HAS_NO_QUESTIONS':
      return 'Đề thi chưa có câu hỏi để bắt đầu.';
    case 'QUESTION_CONTENT_NEEDS_REVIEW':
    case 'EXAM_ROOM_QUESTION_CONTENT_NEEDS_REVIEW':
      return 'Phòng thi đang được rà soát nội dung. Vui lòng chọn phòng khác hoặc thử lại sau.';
    case 'ROOM_NOT_READY':
      return 'Phòng thi chưa sẵn sàng. Quản trị viên cần kiểm tra đề và lịch mở phòng.';
    case 'PRACTICE_REQUIRES_PRACTICE_RPC':
      return 'Phòng tự luyện cần được mở từ mục Tự luyện.';
    case 'NOT_AUTHENTICATED':
      return 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.';
    case 'NOT_STUDENT':
      return 'Tài khoản hiện tại chưa có hồ sơ học sinh trong cơ sở dữ liệu.';
    case 'SESSION_ALREADY_EXISTS':
    case 'SESSION_ALREADY_ACTIVE':
      return 'Bạn đang có một bài thi khác chưa hoàn thành. Hãy hoàn thành hoặc chờ hết giờ rồi quay lại (dùng nút "Tiếp tục bài thi" ở trang chọn môn).';
    case 'EXAM_ROOM_CLOSED':
      return 'Phòng thi này đã đóng.';
    default:
      return fallback || 'Không thể tham gia phòng thi.';
  }
}

export default function RoomKeyPage({ roomId }: { roomId?: string }) {
  const hasConfiguredSupabase = hasSupabaseEnv();
  const [key, setKey] = useState('');
  const [error, setError] = useState('');
  const [selectedRoom, setSelectedRoom] = useState<ExamRoomSummary | null>(null);
  const [isLoadingRoom, setIsLoadingRoom] = useState(hasConfiguredSupabase);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const selectedExamSetId = useExamStore((state) => state.selectedExamSetId);
  const selectExamSet = useExamStore((state) => state.selectExamSet);
  const router = useRouter();
  const effectiveRoomId = roomId ?? selectedExamSetId;

  useEffect(() => {
    if (!effectiveRoomId) {
      router.push('/subjects');
      return;
    }

    if (!hasConfiguredSupabase) return;

    let isMounted = true;
    const supabase = createClient();

    fetchExamRoomById(supabase, effectiveRoomId)
      .then((room) => {
        if (!isMounted) return;
        if (!room) {
          setError('Phòng thi đã chọn không còn tồn tại trong cơ sở dữ liệu.');
          return;
        }
        setSelectedRoom(room);
        if (roomId) selectExamSet(room.subjectCode, room.id);
      })
      .catch((loadError: unknown) => {
        if (!isMounted) return;
        const message =
          loadError instanceof Error
            ? loadError.message
            : 'Không thể tải phòng thi từ Supabase.';
        setError(message);
      })
      .finally(() => {
        if (isMounted) setIsLoadingRoom(false);
      });

    return () => {
      isMounted = false;
    };
  }, [effectiveRoomId, hasConfiguredSupabase, roomId, router, selectExamSet]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedKey = key.trim().toUpperCase();

    if (trimmedKey.length < 6) {
      setError('Mã phòng thi không hợp lệ (tối thiểu 6 ký tự).');
      return;
    }

    if (!effectiveRoomId || !selectedRoom) {
      setError('Vui lòng chọn môn và phòng thi trước khi nhập key.');
      return;
    }

    setIsSubmitting(true);
    setError('');

    try {
      const supabase = createClient();

      // Keys are global; the selected room determines the concrete exam session.
      // Key bind vao tai khoan (assigned_to) — khong bind thiet bi.
      const { data: sessionId, error: rpcError } = await supabase.rpc('join_exam', {
        p_code: trimmedKey,
        p_subject_code: selectedRoom.subjectCode,
        p_exam_room_id: effectiveRoomId,
      });

      if (rpcError) {
        // join_exam throw bằng: raise exception 'HINT_CODE'
        // Supabase truyền message dưới dạng string thẳng
        const hint = rpcError.message?.trim();
        setError(keyErrorMessage(hint, rpcError.message));
        return;
      }

      if (!sessionId) {
        setError('Không thể tạo phiên thi. Vui lòng thử lại.');
        return;
      }

      useExamStore.getState().setSession(sessionId as string, trimmedKey);
      router.push(`/exam/${sessionId}`);
    } catch (submitError) {
      const message =
        submitError instanceof Error
          ? submitError.message
          : 'Lỗi kết nối máy chủ.';
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const displayError =
    error ||
    (!hasConfiguredSupabase
      ? 'Chưa cấu hình Supabase nên không thể tải phòng thi.'
      : '');

  const isRoomReady = Boolean(selectedRoom);

  return (
    <div className={`${styles.container} ${styles.withStudentNav}`}>
      <StudentNav />
      <header className={styles.topbar}>
        <div className={styles.topbarInner}>
          <span className={styles.crest} aria-hidden="true">THPT</span>
          <div>
            <p className={styles.brandTitle}>Kỳ thi tốt nghiệp THPT Quốc gia</p>
            <p className={styles.brandSub}>Bước 2/3 — nhập mã phòng thi</p>
          </div>
        </div>
      </header>

      <div className={styles.main}>
        <section className={styles.heroPanel} aria-labelledby="roomkey-hero-title">
          <span className={styles.heroKicker}>Vào phòng thi</span>
          <h1 id="roomkey-hero-title" className={styles.heroTitle}>Kiểm tra phòng trước khi nhập key</h1>
          <p className={styles.heroText}>
            Mỗi key gắn với một phòng và số lượt nhất định. Kiểm tra đúng môn, đúng
            ca rồi mới nhập mã để tránh mất lượt.
          </p>
          <ol className={styles.steps}>
            <li className={styles.step}>
              <span className={styles.stepNum} aria-hidden="true">1</span>
              <div><strong>Đã chọn phòng</strong><span>Thông tin phòng hiện ở thẻ bên phải.</span></div>
            </li>
            <li className={styles.step}>
              <span className={styles.stepNum} aria-hidden="true">2</span>
              <div><strong>Nhập key IN HOA</strong><span>Tối thiểu 6 ký tự, hệ thống tự viết hoa.</span></div>
            </li>
            <li className={styles.step}>
              <span className={styles.stepNum} aria-hidden="true">3</span>
              <div><strong>Vào phòng làm bài</strong><span>Giờ tính từ máy chủ ngay khi vào.</span></div>
            </li>
          </ol>
        </section>

        <main id="main" tabIndex={-1} className={styles.card} aria-labelledby="roomkey-title">
          <h1 id="roomkey-title" className={styles.title}>Nhập mã phòng thi</h1>
          <p className={styles.subtitle}>
            Vui lòng nhập mã phòng thi được cấp trong hệ thống để bắt đầu phiên thi.
          </p>
          <div className={styles.readinessRow} role="status" aria-live="polite">
            <span className={`${styles.badge} ${isRoomReady ? styles.badgeReady : styles.badgeWarn}`}>
              <span className={styles.badgeDot} aria-hidden="true" />
              {isLoadingRoom ? 'Đang kiểm tra phòng…' : isRoomReady ? 'Phòng sẵn sàng' : 'Chưa chọn được phòng'}
            </span>
            {selectedRoom ? (
              <span className={styles.badge}>
                {selectedRoom.durationMinutes} phút · {formatPriceVnd(selectedRoom.priceVnd)}
              </span>
            ) : null}
          </div>
          {selectedRoom ? (
            <div className={styles.selectionSummary}>
              <span>{selectedRoom.subjectName}</span>
              <strong>{selectedRoom.name}</strong>
              <small>
                {selectedRoom.code} · {selectedRoom.durationMinutes} phút ·{' '}
                {formatPriceVnd(selectedRoom.priceVnd)}
              </small>
            </div>
          ) : null}

        <form onSubmit={handleSubmit}>
          <div className={styles.formGroup}>
            <label className={styles.label} htmlFor="room-key-input">
              Mã phòng thi <span className={styles.required} aria-hidden="true">*</span>
            </label>
            <div className={styles.inputWrapper}>
              <KeyRound className={styles.inputIcon} aria-hidden="true" />
              <input
                id="room-key-input"
                name="roomKey"
                type="text"
                required
                minLength={6}
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                className={styles.input}
                value={key}
                onChange={(event) => {
                  setKey(event.target.value.toUpperCase());
                  setError('');
                }}
                placeholder="VD: THPT-XXXXXX"
                aria-describedby="room-key-hint"
              />
            </div>
            <p id="room-key-hint" className={styles.fieldHint}>Mã IN HOA, tối thiểu 6 ký tự, do hội đồng thi cấp.</p>
            <div aria-live="assertive">
              {displayError && <p className={styles.errorText} role="alert">{displayError}</p>}
            </div>
          </div>

          <button
            type="submit"
            className={styles.submitBtn}
            disabled={isLoadingRoom || isSubmitting || !selectedRoom}
          >
            {isSubmitting ? 'Đang vào phòng...' : 'Vào phòng thi'}
          </button>
        </form>

        <div className={`${styles.footerLinks} ${styles.centered}`}>
          <Link href="/purchase" className={styles.forgotLink}>
            Mua key tự động
          </Link>
          <Link href="/subjects" transitionTypes={['nav-back']} className={styles.forgotLink}>
            &larr; Quay lại chọn môn và phòng thi
          </Link>
        </div>
        </main>
      </div>
    </div>
  );
}
