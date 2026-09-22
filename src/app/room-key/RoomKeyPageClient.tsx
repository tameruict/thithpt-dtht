'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { KeyRound, Rocket, Ticket, ShoppingCart } from 'lucide-react';
import styles from '@/styles/auth.module.css';
import { useExamStore } from '@/store/useExamStore';
import { createClient } from '@/lib/supabase/client';
import { hasSupabaseEnv } from '@/lib/supabase/env';
import {
  fetchExamRoomById,
  formatPriceVnd,
  getAttemptStatus,
  startFreeExamSession,
  type AttemptStatus,
  type ExamRoomSummary,
} from '@/lib/supabase/exam-data';

function keyErrorMessage(hint: string | undefined, fallback?: string) {
  switch (hint) {
    case 'NO_ATTEMPTS_REMAINING':
      return 'Bạn đã hết lượt thi miễn phí. Hãy mua thêm gói lượt để tiếp tục.';
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
      return 'Vui lòng chọn môn thi trước khi bắt đầu.';
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

export default function RoomKeyPageClient({ roomId }: { roomId?: string }) {
  const hasConfiguredSupabase = hasSupabaseEnv();
  const [key, setKey] = useState('');
  const [error, setError] = useState('');
  const [selectedRoom, setSelectedRoom] = useState<ExamRoomSummary | null>(null);
  const [attempts, setAttempts] = useState<AttemptStatus | null>(null);
  const [isLoadingRoom, setIsLoadingRoom] = useState(hasConfiguredSupabase);
  const [isStarting, setIsStarting] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showManualKey, setShowManualKey] = useState(false);
  const [outOfAttempts, setOutOfAttempts] = useState(false);
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
        setError(
          loadError instanceof Error
            ? loadError.message
            : 'Không thể tải phòng thi từ Supabase.',
        );
      })
      .finally(() => {
        if (isMounted) setIsLoadingRoom(false);
      });

    getAttemptStatus(supabase)
      .then((status) => {
        if (isMounted) setAttempts(status);
      })
      .catch(() => {
        // Non-fatal: the start action still enforces quota server-side.
      });

    return () => {
      isMounted = false;
    };
  }, [effectiveRoomId, hasConfiguredSupabase, roomId, router, selectExamSet]);

  const handleStart = async () => {
    if (!effectiveRoomId || !selectedRoom) {
      setError('Vui lòng chọn môn và phòng thi trước khi bắt đầu.');
      return;
    }
    setIsStarting(true);
    setError('');
    setOutOfAttempts(false);
    try {
      const supabase = createClient();
      const sessionId = await startFreeExamSession(supabase, {
        subjectCode: selectedRoom.subjectCode,
        examRoomId: effectiveRoomId,
      });
      useExamStore.getState().setSession(sessionId as string, '');
      router.push(`/exam/${sessionId}`);
    } catch (startError) {
      const hint =
        startError instanceof Error ? startError.message.trim() : undefined;
      if (hint === 'NO_ATTEMPTS_REMAINING') setOutOfAttempts(true);
      setError(keyErrorMessage(hint, hint));
    } finally {
      setIsStarting(false);
    }
  };

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
      const { data: sessionId, error: rpcError } = await supabase.rpc('join_exam', {
        p_code: trimmedKey,
        p_subject_code: selectedRoom.subjectCode,
        p_exam_room_id: effectiveRoomId,
      });

      if (rpcError) {
        setError(keyErrorMessage(rpcError.message?.trim(), rpcError.message));
        return;
      }
      if (!sessionId) {
        setError('Không thể tạo phiên thi. Vui lòng thử lại.');
        return;
      }

      useExamStore.getState().setSession(sessionId as string, trimmedKey);
      router.push(`/exam/${sessionId}`);
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : 'Lỗi kết nối máy chủ.',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const displayError =
    error ||
    (!hasConfiguredSupabase
      ? 'Chưa cấu hình Supabase nên không thể tải phòng thi.'
      : '');

  return (
    <div className={styles.container}>
      <header className={styles.topbar}>
        <div className={styles.topbarInner}>
          <span className={styles.crest} aria-hidden="true">THPT</span>
          <div>
            <p className={styles.brandTitle}>Kỳ thi tốt nghiệp THPT Quốc gia</p>
            <p className={styles.brandSub}>Vào phòng thi trực tuyến</p>
          </div>
        </div>
      </header>

      <div className={styles.cardWrap}>
      <main id="main" tabIndex={-1} className={styles.card}>
        <h1 className={styles.title}>Sẵn sàng vào thi</h1>
        <p className={styles.subtitle}>
          Bấm bắt đầu để vào phòng thi. Hệ thống sẽ dùng lượt thi miễn phí của bạn,
          hết lượt miễn phí sẽ tự dùng lượt trong gói đã mua.
        </p>

        {isLoadingRoom && !selectedRoom ? (
          <div className={styles.selectionSummary} role="status" aria-live="polite" aria-busy="true">
            <span className={styles.visuallyHidden}>Đang tải thông tin phòng thi…</span>
            <div className={styles.skeletonLine} style={{ width: '40%' }} aria-hidden="true" />
            <div className={styles.skeletonLine} style={{ width: '75%', height: 16 }} aria-hidden="true" />
            <div className={styles.skeletonLine} style={{ width: '60%' }} aria-hidden="true" />
          </div>
        ) : selectedRoom ? (
          <div className={styles.selectionSummary}>
            <span>{selectedRoom.subjectName}</span>
            <strong>{selectedRoom.name}</strong>
            <small>
              {selectedRoom.code} · {selectedRoom.durationMinutes} phút ·{' '}
              {formatPriceVnd(selectedRoom.priceVnd)}
            </small>
          </div>
        ) : null}

        {attempts ? (
          <div className={styles.attemptBar} role="status" aria-live="polite">
            <Ticket size={16} aria-hidden="true" />
            <span>
              Còn <strong>{attempts.totalRemaining}</strong> lượt
              {attempts.freeRemaining > 0 ? (
                <> ({attempts.freeRemaining} miễn phí</>
              ) : (
                <> (0 miễn phí</>
              )}
              {attempts.keyRemaining > 0 ? <> + {attempts.keyRemaining} đã mua)</> : <>)</>}
            </span>
          </div>
        ) : null}

        {outOfAttempts ? (
          <div className={styles.upsell} role="alert">
            <p>Bạn đã hết lượt thi. Mua thêm gói lượt để tiếp tục luyện thi.</p>
            <Link href="/purchase" className={styles.submitBtn}>
              <ShoppingCart size={18} aria-hidden="true" />
              Mua thêm lượt
            </Link>
          </div>
        ) : (
          <button
            type="button"
            className={styles.submitBtn}
            onClick={handleStart}
            disabled={isLoadingRoom || isStarting || !selectedRoom}
          >
            <Rocket size={18} aria-hidden="true" />
            {isStarting ? 'Đang vào phòng...' : 'Bắt đầu thi'}
          </button>
        )}

        {displayError && !outOfAttempts ? (
          <p className={styles.errorText} role="alert">{displayError}</p>
        ) : null}

        <details
          className={styles.manualKey}
          open={showManualKey}
          onToggle={(e) => setShowManualKey((e.target as HTMLDetailsElement).open)}
        >
          <summary>
            <KeyRound size={15} aria-hidden="true" /> Có mã key riêng? Nhập tại đây
          </summary>
          <form onSubmit={handleSubmit}>
            <div className={styles.formGroup}>
              <div className={styles.inputWrapper}>
                <KeyRound className={styles.inputIcon} />
                <input
                  type="text"
                  className={styles.input}
                  value={key}
                  onChange={(event) => {
                    setKey(event.target.value.toUpperCase());
                    setError('');
                  }}
                  placeholder="Nhập mã key được cấp"
                />
              </div>
            </div>
            <button
              type="submit"
              className="btn outline"
              disabled={isLoadingRoom || isSubmitting || !selectedRoom}
            >
              {isSubmitting ? 'Đang vào phòng...' : 'Vào phòng bằng key'}
            </button>
          </form>
        </details>

        <div className={`${styles.footerLinks} ${styles.centered}`}>
          <Link href="/purchase" className={styles.forgotLink}>
            Mua thêm lượt thi
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
