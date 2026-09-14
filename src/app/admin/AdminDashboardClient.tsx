'use client';

import { FormEvent, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Archive,
  Ban,
  BarChart3,
  BookOpenCheck,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  DoorOpen,
  Download,
  FilePenLine,
  GraduationCap,
  Inbox,
  KeyRound,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
  Users,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { hasSupabaseEnv } from '@/lib/supabase/env';
import { difficultyLabel } from '@/lib/supabase/exam-data';
import { HANOI_TZ, hanoiEndOfDayISO, hanoiTodayInputValue } from '@/lib/datetime';
import { showToast } from '@/components/ui/Toast';
import styles from '@/styles/admin.module.css';

type Subject = {
  code: string;
  name: string;
  duration: number;
  status: 'Đang mở' | 'Nháp';
};

type QuestionStatus = 'draft' | 'reviewing' | 'approved' | 'archived';

type DraftQuestion = {
  id: string;
  code: string;
  subject: string;
  subjectCode: string;
  title: string;
  difficulty: string;
  difficultyLevel: number;
  status: QuestionStatus;
  answer: string | null;
};

type ExamKeyStatus = 'unused' | 'active' | 'exhausted' | 'expired' | 'revoked';
type KeyStatusLabel = 'Chưa dùng' | 'Đang dùng' | 'Hết lượt' | 'Hết hạn' | 'Đã thu hồi';

type ExamKey = {
  id: string;
  code: string;
  subject: string;
  room: string;
  student: string;
  isPublic: boolean;
  attempts: string;
  status: KeyStatusLabel;
  rawStatus: ExamKeyStatus;
  usedAttempts: number;
  expiresAt: string | null;
  createdAt: string | null;
};

type Student = {
  code: string;
  name: string;
  school: string;
  key: string;
};

type AdminExamKeyRecord = {
  id: string;
  code: string;
  exam_room_name: string;
  subject_name: string;
  student_name: string | null;
  is_public: boolean;
  total_attempts: number;
  used_attempts: number;
  status: ExamKeyStatus;
  expires_at: string | null;
  created_at: string | null;
};

type GeneratedExamKeyRecord = {
  id: string;
  code: string;
  exam_room_name: string;
  subject_code: string | null;
  is_public: boolean;
  total_attempts: number;
  used_attempts: number;
  status: ExamKeyStatus;
  expires_at: string | null;
  created_at: string | null;
};

type SubjectRecord = {
  code: string;
  name: string;
  default_duration_minutes: number;
  is_active: boolean;
};

type QuestionRecord = {
  id: string;
  code: string;
  subject_code: string;
  content: string;
  difficulty: number;
  status: string;
  metadata: { draft_answer_label?: string } | null;
  subjects?: { name: string } | { name: string }[] | null;
};

type StudentSummaryRecord = {
  student_id: string;
  gmail: string | null;
  full_name: string | null;
  school_name: string | null;
  current_key_code: string | null;
};

type ExamSessionStatus = 'in_progress' | 'submitted' | 'abandoned' | 'expired';

type ExamResultRecord = {
  session_id: string;
  student_id: string;
  student_name: string | null;
  school_name: string | null;
  exam_room_id: string;
  room_name: string | null;
  room_code: string | null;
  subject_code: string | null;
  subject_name: string | null;
  attempt_number: number;
  status: ExamSessionStatus;
  score: number | string | null;
  max_score: number | string | null;
  violation_count: number | string | null;
  started_at: string | null;
  submitted_at: string | null;
  scored_at: string | null;
  finalized: string | null;
};

type ExamResult = {
  sessionId: string;
  studentName: string;
  school: string;
  subjectCode: string;
  subjectName: string;
  roomName: string;
  roomCode: string;
  attempt: number;
  status: ExamSessionStatus;
  autoExpired: boolean;
  score: number | null;
  maxScore: number;
  violations: number;
  startedAt: string | null;
  submittedAt: string | null;
};

type ExamRoomStatus = 'draft' | 'published' | 'archived';

type ExamRoomRecord = {
  id: string;
  code: string;
  name: string;
  subject_code: string;
  subject_name: string | null;
  blueprint_id: string;
  blueprint_code: string | null;
  blueprint_name: string | null;
  duration_minutes: number;
  status: ExamRoomStatus;
  price_vnd: number;
  total_attempts_default: number;
  starts_at: string | null;
  ends_at: string | null;
  published_at: string | null;
  created_at: string | null;
  paper_count: number;
  question_count: number;
};

type ExamRoom = {
  id: string;
  code: string;
  name: string;
  subjectCode: string;
  subjectName: string;
  blueprintId: string;
  blueprintName: string;
  durationMinutes: number;
  status: ExamRoomStatus;
  priceVnd: number;
  totalAttempts: number;
  startsAt: string | null;
  endsAt: string | null;
  paperCount: number;
  questionCount: number;
};

type BlueprintRecord = {
  id: string;
  code: string;
  name: string;
  subject_code: string;
  status: string;
};

type BlueprintOption = {
  id: string;
  code: string;
  name: string;
  subjectCode: string;
};

type RoomFormState = {
  name: string;
  code: string;
  subjectCode: string;
  blueprintId: string;
  durationMinutes: string;
  totalAttempts: string;
  priceVnd: string;
  startsAt: string;
  endsAt: string;
  status: ExamRoomStatus;
};

const emptyRoomForm: RoomFormState = {
  name: '',
  code: '',
  subjectCode: '',
  blueprintId: '',
  durationMinutes: '50',
  totalAttempts: '1',
  priceVnd: '0',
  startsAt: '',
  endsAt: '',
  status: 'draft',
};

type PendingEssayRecord = {
  answer_id: string;
  session_id: string;
  student_name: string | null;
  room_name: string | null;
  subject_name: string | null;
  display_no: string | null;
  max_points: number | string;
  question_content: string;
  student_answer: string | null;
  earned_points: number | string | null;
  submitted_at: string | null;
};

type PendingEssay = {
  answerId: string;
  studentName: string;
  roomName: string;
  subjectName: string;
  displayNo: string;
  maxPoints: number;
  questionContent: string;
  studentAnswer: string;
  submittedAt: string | null;
};

const keyStatusLabels: Record<ExamKeyStatus, KeyStatusLabel> = {
  unused: 'Chưa dùng',
  active: 'Đang dùng',
  exhausted: 'Hết lượt',
  expired: 'Hết hạn',
  revoked: 'Đã thu hồi',
};

const activeKeyStatuses = new Set<KeyStatusLabel>(['Chưa dùng', 'Đang dùng']);

const examStatusFilterOptions: { value: string; label: string }[] = [
  { value: '', label: 'Tất cả trạng thái' },
  { value: 'submitted', label: 'Đã nộp' },
  { value: 'in_progress', label: 'Đang làm' },
  { value: 'expired', label: 'Hết giờ' },
  { value: 'abandoned', label: 'Bỏ dở' },
];

function examStatusLabel(status: ExamSessionStatus, autoExpired: boolean): string {
  switch (status) {
    case 'in_progress':
      return 'Đang làm';
    case 'submitted':
      return autoExpired ? 'Hết giờ' : 'Đã nộp';
    case 'expired':
      return 'Hết giờ';
    case 'abandoned':
      return 'Bỏ dở';
    default:
      return status;
  }
}

const questionStatusLabels: Record<QuestionStatus, string> = {
  draft: 'Nháp',
  reviewing: 'Đang duyệt',
  approved: 'Đã duyệt',
  archived: 'Lưu trữ',
};

const questionStatusOptions: QuestionStatus[] = ['draft', 'reviewing', 'approved', 'archived'];

const questionDifficultyOptions = [1, 2, 3, 4];

const roomStatusLabels: Record<ExamRoomStatus, string> = {
  draft: 'Nháp',
  published: 'Đang mở',
  archived: 'Đã đóng',
};

// ---- Layout SaaS: tabs + phân trang (presentation-only) ----
type TabId = 'overview' | 'rooms' | 'bank' | 'keys' | 'grading';

const TABS: { id: TabId; label: string; hash: string; description: string }[] = [
  { id: 'overview', label: 'Kết quả', hash: '#results', description: 'Điểm, lượt thi và thống kê theo phòng/môn.' },
  { id: 'rooms', label: 'Phòng thi', hash: '#rooms', description: 'Tạo phòng, gắn blueprint, mở/đóng phòng.' },
  { id: 'bank', label: 'Ngân hàng đề', hash: '#compose', description: 'Câu hỏi, trạng thái duyệt và môn học.' },
  { id: 'keys', label: 'Key', hash: '#keys', description: 'Cấp key, quota, gia hạn và thu hồi.' },
  { id: 'grading', label: 'Chấm & Học viên', hash: '#grading', description: 'Chấm tự luận và tra cứu học viên.' },
];

function tabFromHash(hash: string): TabId {
  return TABS.find((tab) => tab.hash === hash)?.id ?? 'overview';
}

const RESULTS_PAGE_SIZE = 20;
const QUESTIONS_PAGE_SIZE = 12;
const KEYS_PAGE_SIZE = 15;
const ROOMS_PAGE_SIZE = 10;
const STUDENTS_PAGE_SIZE = 15;
const ESSAYS_PAGE_SIZE = 6;

type DialogState =
  | {
      id: number;
      kind: 'confirm';
      title: string;
      desc: string;
      confirmLabel: string;
      danger?: boolean;
      onConfirm: () => Promise<void> | void;
    }
  | {
      id: number;
      kind: 'prompt';
      title: string;
      desc: string;
      label: string;
      defaultValue: string;
      inputType: string;
      confirmLabel: string;
      onConfirm: (value: string) => Promise<void> | void;
    };

let dialogSeq = 0;

function localInputToIso(value: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function isoToLocalInput(value: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  // datetime-local cần YYYY-MM-DDTHH:mm theo giờ địa phương của trình duyệt.
  const pad = (input: number) => String(input).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function getDefaultExpiryDate() {
  // 30 ngày kể từ "hôm nay" theo giờ Hà Nội.
  const base = new Date(`${hanoiTodayInputValue()}T00:00:00+07:00`);
  base.setDate(base.getDate() + 30);

  return hanoiTodayInputValue(base);
}

function getEndOfDayIso(dateValue: string) {
  // 23:59:59.999 cuối ngày theo giờ Hà Nội của ngày người dùng chọn.
  return hanoiEndOfDayISO(dateValue) ?? new Date(dateValue).toISOString();
}

function formatDate(value: string | null) {
  if (!value) return 'Không đặt';

  return new Intl.DateTimeFormat('vi-VN', {
    timeZone: HANOI_TZ,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(value));
}

function mapKeyRecord(key: AdminExamKeyRecord): ExamKey {
  return {
    id: key.id,
    code: key.code,
    subject: key.subject_name,
    room: key.exam_room_name,
    student: key.is_public ? 'Nhiều tài khoản' : key.student_name ?? 'Chưa gán',
    isPublic: key.is_public,
    attempts: `${key.used_attempts}/${key.total_attempts}`,
    status: keyStatusLabels[key.status],
    rawStatus: key.status,
    usedAttempts: key.used_attempts,
    expiresAt: key.expires_at,
    createdAt: key.created_at,
  };
}

function getErrorMessage(error: unknown) {
  const message =
    error && typeof error === 'object' && 'message' in error
      ? String((error as { message?: unknown }).message ?? '')
      : '';

  if (message.includes('Only staff') || message.includes('row-level security')) {
    return 'Tài khoản hiện tại cần role admin trong Supabase để tạo key.';
  }

  if (message.includes('Key expiry must be in the future')) {
    return 'Ngày hết hạn phải nằm trong tương lai.';
  }

  if (message.includes('Total attempts must be between')) {
    return 'Giới hạn lượt làm phải từ 1 đến 100.000.';
  }

  return message ? `Không tạo được key: ${message}` : 'Không tạo được key. Vui lòng thử lại.';
}

function getAdminDataErrorMessage(error: unknown) {
  const message =
    error && typeof error === 'object' && 'message' in error
      ? String((error as { message?: unknown }).message ?? '')
      : '';
  const code =
    error && typeof error === 'object' && 'code' in error
      ? String((error as { code?: unknown }).code ?? '')
      : '';

  if (
    message.includes('permission denied') ||
    message.includes('row-level security')
  ) {
    return 'Tài khoản hiện tại cần role admin trong Supabase để xem và chỉnh dữ liệu quản trị.';
  }

  if (code === '23503' || message.includes('foreign key constraint')) {
    return 'Không thể xóa vì dữ liệu này đang được sử dụng (ví dụ: đã có câu hỏi, phòng thi, v.v.). Vui lòng chuyển sang trạng thái "Nháp" thay vì xóa.';
  }

  return message
    ? `Lỗi thao tác dữ liệu: ${message}`
    : 'Lỗi thao tác dữ liệu. Vui lòng thử lại.';
}

function getRoomErrorMessage(error: unknown) {
  const message =
    error && typeof error === 'object' && 'message' in error
      ? String((error as { message?: unknown }).message ?? '')
      : '';
  const code =
    error && typeof error === 'object' && 'code' in error
      ? String((error as { code?: unknown }).code ?? '')
      : '';

  if (code === '23505' || message.includes('duplicate key') || message.includes('unique')) {
    return 'Mã phòng đã tồn tại. Vui lòng chọn mã khác.';
  }
  if (code === '23503' || message.includes('foreign key')) {
    return 'Blueprint không khớp môn học của phòng. Hãy chọn blueprint cùng môn.';
  }
  if (message.includes('permission denied') || message.includes('row-level security')) {
    return 'Tài khoản cần role admin để quản lý phòng thi.';
  }
  return message ? `Lỗi thao tác phòng thi: ${message}` : 'Không lưu được phòng thi.';
}

function firstRelation<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

function mapSubjectRecord(subject: SubjectRecord): Subject {
  return {
    code: subject.code,
    name: subject.name,
    duration: subject.default_duration_minutes,
    status: subject.is_active ? 'Đang mở' : 'Nháp',
  };
}

function mapQuestionRecord(question: QuestionRecord): DraftQuestion {
  const subject = firstRelation(question.subjects);

  return {
    id: question.id,
    code: question.code,
    subject: subject?.name ?? question.subject_code,
    subjectCode: question.subject_code,
    title: question.content,
    difficulty: difficultyLabel(question.difficulty),
    difficultyLevel: question.difficulty,
    status: (question.status as QuestionStatus) ?? 'draft',
    answer: question.metadata?.draft_answer_label ?? null,
  };
}

function mapStudentSummary(student: StudentSummaryRecord): Student {
  return {
    code: student.student_id.slice(0, 8).toUpperCase(),
    name: student.full_name ?? student.gmail ?? 'Chưa cập nhật',
    school: student.school_name ?? 'Chưa cập nhật',
    key: student.current_key_code ?? 'Chưa gán',
  };
}

function toFiniteNumber(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatDateTime(value: string | null) {
  if (!value) return '—';

  return new Intl.DateTimeFormat('vi-VN', {
    timeZone: HANOI_TZ,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function mapExamResult(record: ExamResultRecord): ExamResult {
  const maxScore = toFiniteNumber(record.max_score) ?? 10;

  return {
    sessionId: record.session_id,
    studentName: record.student_name?.trim() || 'Chưa cập nhật',
    school: record.school_name?.trim() || '—',
    subjectCode: record.subject_code ?? '',
    subjectName: record.subject_name?.trim() || record.subject_code || '—',
    roomName: record.room_name?.trim() || record.room_code || '—',
    roomCode: record.room_code ?? '',
    attempt: record.attempt_number,
    status: record.status,
    autoExpired: record.finalized === 'auto_expired',
    score: toFiniteNumber(record.score),
    maxScore: maxScore > 0 ? maxScore : 10,
    violations: toFiniteNumber(record.violation_count) ?? 0,
    startedAt: record.started_at,
    submittedAt: record.submitted_at,
  };
}

// Điểm quy về thang 10 để so sánh/thống kê không phụ thuộc max_score từng đề.
function normalizedScore(result: ExamResult): number | null {
  if (result.score === null) return null;
  if (result.maxScore <= 0) return null;
  return (result.score / result.maxScore) * 10;
}

function csvCell(value: string | number | null | undefined) {
  const text = value === null || value === undefined ? '' : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

function buildResultsCsv(rows: ExamResult[]): string {
  const header = [
    'Họ tên',
    'Trường',
    'Môn',
    'Phòng',
    'Mã đề',
    'Lượt',
    'Điểm',
    'Thang điểm',
    'Trạng thái',
    'Rời tab',
    'Bắt đầu',
    'Nộp bài',
  ];

  const lines = rows.map((row) =>
    [
      csvCell(row.studentName),
      csvCell(row.school),
      csvCell(row.subjectName),
      csvCell(row.roomName),
      csvCell(row.roomCode),
      csvCell(row.attempt),
      csvCell(row.score === null ? '' : row.score.toFixed(2)),
      csvCell(row.maxScore),
      csvCell(examStatusLabel(row.status, row.autoExpired)),
      csvCell(row.violations),
      csvCell(formatDateTime(row.startedAt)),
      csvCell(formatDateTime(row.submittedAt)),
    ].join(','),
  );

  // BOM để Excel (vi-VN) đọc đúng UTF-8 tiếng Việt.
  return `﻿${[header.map(csvCell).join(','), ...lines].join('\r\n')}`;
}

function buildKeysCsv(rows: ExamKey[]): string {
  const header = ['Key', 'Loại', 'Phòng', 'Học viên', 'Lượt', 'Hết hạn', 'Trạng thái'];
  const lines = rows.map((row) =>
    [
      csvCell(row.code),
      csvCell(row.isPublic ? 'Public' : 'Cá nhân'),
      csvCell(row.room),
      csvCell(row.student),
      csvCell(row.attempts),
      csvCell(formatDate(row.expiresAt)),
      csvCell(row.status),
    ].join(','),
  );
  return `﻿${[header.map(csvCell).join(','), ...lines].join('\r\n')}`;
}

function buildRoomsCsv(rows: ExamRoom[]): string {
  const header = ['Mã phòng', 'Tên phòng', 'Môn', 'Thời lượng', 'Số câu', 'Số đề', 'Trạng thái'];
  const lines = rows.map((row) =>
    [
      csvCell(row.code),
      csvCell(row.name),
      csvCell(row.subjectName),
      csvCell(row.durationMinutes),
      csvCell(row.questionCount),
      csvCell(row.paperCount),
      csvCell(roomStatusLabels[row.status]),
    ].join(','),
  );
  return `﻿${[header.map(csvCell).join(','), ...lines].join('\r\n')}`;
}

function buildStudentsCsv(rows: Student[]): string {
  const header = ['SBD', 'Họ tên', 'Trường', 'Key hiện tại'];
  const lines = rows.map((row) =>
    [csvCell(row.code), csvCell(row.name), csvCell(row.school), csvCell(row.key)].join(','),
  );
  return `﻿${[header.map(csvCell).join(','), ...lines].join('\r\n')}`;
}

function buildQuestionsCsv(rows: DraftQuestion[]): string {
  const header = ['Mã', 'Môn', 'Nội dung', 'Độ khó', 'Trạng thái'];
  const lines = rows.map((row) =>
    [
      csvCell(row.code),
      csvCell(row.subject),
      csvCell(row.title),
      csvCell(row.difficulty),
      csvCell(questionStatusLabels[row.status]),
    ].join(','),
  );
  return `﻿${[header.map(csvCell).join(','), ...lines].join('\r\n')}`;
}

function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function mapExamRoom(record: ExamRoomRecord): ExamRoom {
  return {
    id: record.id,
    code: record.code,
    name: record.name,
    subjectCode: record.subject_code,
    subjectName: record.subject_name?.trim() || record.subject_code,
    blueprintId: record.blueprint_id,
    blueprintName: record.blueprint_name?.trim() || record.blueprint_code || '—',
    durationMinutes: record.duration_minutes,
    status: record.status,
    priceVnd: record.price_vnd,
    totalAttempts: record.total_attempts_default,
    startsAt: record.starts_at,
    endsAt: record.ends_at,
    paperCount: Number(record.paper_count) || 0,
    questionCount: Number(record.question_count) || 0,
  };
}

function mapBlueprint(record: BlueprintRecord): BlueprintOption {
  return {
    id: record.id,
    code: record.code,
    name: record.name,
    subjectCode: record.subject_code,
  };
}

function mapPendingEssay(record: PendingEssayRecord): PendingEssay {
  return {
    answerId: record.answer_id,
    studentName: record.student_name?.trim() || 'Chưa cập nhật',
    roomName: record.room_name?.trim() || '—',
    subjectName: record.subject_name?.trim() || '—',
    displayNo: record.display_no ?? '?',
    maxPoints: toFiniteNumber(record.max_points) ?? 0,
    questionContent: record.question_content ?? '',
    studentAnswer: record.student_answer?.trim() || '',
    submittedAt: record.submitted_at,
  };
}

// ---- UI primitives (presentation-only, dùng tokens admin.module.css) ----

function PaginationBar({
  page,
  pageCount,
  total,
  unit,
  onPage,
}: {
  page: number;
  pageCount: number;
  total: number;
  unit: string;
  onPage: (page: number) => void;
}) {
  if (total === 0) return null;
  const start = (page - 1) * 1; // Hiển thị trang hiện tại/tổng trang + tổng dòng.
  void start;
  const windowStart = Math.max(1, Math.min(page - 2, pageCount - 4));
  const windowPages = Array.from({ length: Math.min(5, pageCount) }, (_, i) => windowStart + i).filter(
    (p) => p >= 1 && p <= pageCount,
  );
  return (
    <div className={styles.paginationBar}>
      <span className={styles.pageInfo}>
        Trang {page}/{pageCount} · {total} {unit}
      </span>
      <div className={styles.pageButtons}>
        <button
          type="button"
          className={styles.pageBtn}
          onClick={() => onPage(page - 1)}
          disabled={page <= 1}
          aria-label="Trang trước"
        >
          <ChevronLeft size={15} aria-hidden="true" />
        </button>
        {windowPages.map((p) => (
          <button
            key={p}
            type="button"
            className={`${styles.pageBtn} ${p === page ? styles.pageBtnCurrent : ''}`}
            onClick={() => onPage(p)}
            aria-label={`Trang ${p}`}
            aria-current={p === page ? 'page' : undefined}
          >
            {p}
          </button>
        ))}
        <button
          type="button"
          className={styles.pageBtn}
          onClick={() => onPage(page + 1)}
          disabled={page >= pageCount}
          aria-label="Trang sau"
        >
          <ChevronRight size={15} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

function EmptyState({
  icon,
  title,
  desc,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
  action?: React.ReactNode;
}) {
  return (
    <div className={styles.emptyState}>
      {icon}
      <strong>{title}</strong>
      <p>{desc}</p>
      {action}
    </div>
  );
}

function PanelSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className={styles.skeleton} role="status" aria-label="Đang tải dữ liệu">
      {Array.from({ length: rows }).map((_, index) => (
        <span key={index} className={styles.skeletonRow} aria-hidden="true" />
      ))}
    </div>
  );
}

/**
 * Dialog xác nhận/nhập liệu thay window.confirm/prompt.
 * Focus-trap + Esc + trả focus về nơi mở. Chỉ đổi presentation.
 */
function AdminDialog({
  dialog,
  busy,
  onClose,
  onSubmit,
}: {
  dialog: Exclude<DialogState, null>;
  busy: boolean;
  onClose: () => void;
  onSubmit: (value?: string) => void;
}) {
  const [promptValue, setPromptValue] = useState(
    dialog.kind === 'prompt' ? dialog.defaultValue : '',
  );
  const overlayRef = useRef<HTMLDivElement>(null);
  const controlRef = useRef<HTMLInputElement | HTMLButtonElement>(null);
  const prevFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    prevFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    controlRef.current?.focus();
    const overlay = overlayRef.current;
    if (!overlay) return;

    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;
      const focusables = Array.from(
        overlay.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    overlay.addEventListener('keydown', handleKey);
    return () => {
      overlay.removeEventListener('keydown', handleKey);
      prevFocus.current?.focus?.();
    };
  }, [onClose]);

  return (
    <div
      ref={overlayRef}
      className={styles.dialogOverlay}
      onMouseDown={(event) => {
        if (event.target === overlayRef.current) onClose();
      }}
    >
      <div
        className={styles.dialog}
        role={dialog.kind === 'prompt' ? 'dialog' : 'alertdialog'}
        aria-modal="true"
        aria-labelledby="admin-dialog-title"
        aria-describedby="admin-dialog-desc"
      >
        <h3 id="admin-dialog-title" className={styles.dialogTitle}>
          {dialog.title}
        </h3>
        <p id="admin-dialog-desc" className={styles.dialogDesc}>
          {dialog.desc}
        </p>
        {dialog.kind === 'prompt' ? (
          <label className={styles.dialogLabel}>
            {dialog.label}
            <input
              ref={controlRef as React.RefObject<HTMLInputElement>}
              className={styles.dialogInput}
              type={dialog.inputType}
              value={promptValue}
              onChange={(event) => setPromptValue(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') onSubmit(promptValue);
              }}
            />
          </label>
        ) : null}
        <div className={styles.dialogActions}>
          <button type="button" className="btn secondary small" onClick={onClose} disabled={busy}>
            Hủy
          </button>
          <button
            type="button"
            ref={dialog.kind === 'confirm' ? (controlRef as React.RefObject<HTMLButtonElement>) : undefined}
            onClick={() => onSubmit(dialog.kind === 'prompt' ? promptValue : undefined)}
            disabled={busy}
            className={dialog.kind === 'confirm' && dialog.danger ? `btn small ${styles.dangerButton}` : 'btn small'}
          >
            {busy ? 'Đang xử lý...' : dialog.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AdminDashboardClient() {
  const router = useRouter();
  const hasConfiguredSupabase = hasSupabaseEnv();
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [questions, setQuestions] = useState<DraftQuestion[]>([]);
  const [keys, setKeys] = useState<ExamKey[]>([]);
  const [keyMode, setKeyMode] = useState<'public' | 'private'>('public');
  const [keyQuantity, setKeyQuantity] = useState('1');
  const [keyTotalAttempts, setKeyTotalAttempts] = useState('100');
  const [keyExpiry, setKeyExpiry] = useState(getDefaultExpiryDate);
  const [keyNote, setKeyNote] = useState('');
  const [isLoadingCatalog, setIsLoadingCatalog] = useState(false);
  const [isLoadingKeys, setIsLoadingKeys] = useState(false);
  const [isCreatingKeys, setIsCreatingKeys] = useState(false);
  const [catalogFeedback, setCatalogFeedback] = useState('');
  const [keyFeedback, setKeyFeedback] = useState('');
  const [students, setStudents] = useState<Student[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [results, setResults] = useState<ExamResult[]>([]);
  const [isLoadingResults, setIsLoadingResults] = useState(false);
  const [resultsFeedback, setResultsFeedback] = useState('');
  const [resultFilterSubject, setResultFilterSubject] = useState('');
  const [resultFilterRoom, setResultFilterRoom] = useState('');
  const [resultFilterStatus, setResultFilterStatus] = useState('');
  const [questionSearch, setQuestionSearch] = useState('');
  const [questionSubject, setQuestionSubject] = useState('');
  const [questionDifficulty, setQuestionDifficulty] = useState('');
  const [questionStatusFilter, setQuestionStatusFilter] = useState('');
  const [rooms, setRooms] = useState<ExamRoom[]>([]);
  const [blueprints, setBlueprints] = useState<BlueprintOption[]>([]);
  const [isLoadingRooms, setIsLoadingRooms] = useState(false);
  const [roomsFeedback, setRoomsFeedback] = useState('');
  const [roomForm, setRoomForm] = useState<RoomFormState>(emptyRoomForm);
  const [editingRoomId, setEditingRoomId] = useState<string | null>(null);
  const [isSavingRoom, setIsSavingRoom] = useState(false);
  const [pendingEssays, setPendingEssays] = useState<PendingEssay[]>([]);
  const [isLoadingEssays, setIsLoadingEssays] = useState(false);
  const [essaysFeedback, setEssaysFeedback] = useState('');
  const [essayScores, setEssayScores] = useState<Record<string, string>>({});
  const [gradingId, setGradingId] = useState<string | null>(null);

  // ---- State SaaS mới (presentation-only) ----
  // Khởi tạo tab từ hash cũ (#results, #rooms, ...) để link bookmark vẫn đúng.
  const [activeTab, setActiveTab] = useState<TabId>(() => {
    if (typeof window === 'undefined') return 'overview';
    return tabFromHash(window.location.hash);
  });
  const [resultsPage, setResultsPage] = useState(1);
  const [questionsPage, setQuestionsPage] = useState(1);
  const [keysPage, setKeysPage] = useState(1);
  const [roomsPage, setRoomsPage] = useState(1);
  const [studentsPage, setStudentsPage] = useState(1);
  const [essaysPage, setEssaysPage] = useState(1);
  const [keySearch, setKeySearch] = useState('');
  const [keyStatusFilter, setKeyStatusFilter] = useState('');
  const [roomSearch, setRoomSearch] = useState('');
  const [roomStatusFilter, setRoomStatusFilter] = useState('');
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [dialogBusy, setDialogBusy] = useState(false);
  const topbarRef = useRef<HTMLDivElement>(null);

  const deferredStudentSearch = useDeferredValue(searchTerm);
  const deferredQuestionSearch = useDeferredValue(questionSearch);
  const deferredKeySearch = useDeferredValue(keySearch);
  const deferredRoomSearch = useDeferredValue(roomSearch);

  const loadAdminCatalog = useCallback(async () => {
    if (!hasConfiguredSupabase) {
      setCatalogFeedback('Chưa cấu hình Supabase nên admin không tải dữ liệu.');
      return;
    }

    setIsLoadingCatalog(true);
    setCatalogFeedback('');

    try {
      const supabase = createClient();
      const [subjectsResponse, questionsResponse, studentsResponse, blueprintsResponse] =
        await Promise.all([
          supabase
            .from('subjects')
            .select('code,name,default_duration_minutes,is_active')
            .order('name', { ascending: true }),
          supabase
            .from('questions')
            .select('id,code,subject_code,content,difficulty,status,metadata,subjects(name)')
            .order('created_at', { ascending: false })
            .limit(500),
          supabase
            .from('student_key_summary')
            .select('student_id,gmail,full_name,school_name,current_key_code')
            .order('full_name', { ascending: true })
            .limit(200),
          supabase
            .from('exam_blueprints')
            .select('id,code,name,subject_code,status')
            .order('name', { ascending: true }),
        ]);

      if (subjectsResponse.error) throw subjectsResponse.error;
      if (questionsResponse.error) throw questionsResponse.error;
      if (studentsResponse.error) throw studentsResponse.error;
      if (blueprintsResponse.error) throw blueprintsResponse.error;

      setSubjects(((subjectsResponse.data ?? []) as unknown as SubjectRecord[]).map(mapSubjectRecord));
      setQuestions(((questionsResponse.data ?? []) as unknown as QuestionRecord[]).map(mapQuestionRecord));
      setStudents(((studentsResponse.data ?? []) as unknown as StudentSummaryRecord[]).map(mapStudentSummary));
      setBlueprints(((blueprintsResponse.data ?? []) as unknown as BlueprintRecord[]).map(mapBlueprint));
    } catch (error) {
      setCatalogFeedback(getAdminDataErrorMessage(error));
    } finally {
      setIsLoadingCatalog(false);
    }
  }, [hasConfiguredSupabase]);

  const loadKeyManagement = useCallback(async () => {
    if (!hasConfiguredSupabase) return;

    setIsLoadingKeys(true);
    setKeyFeedback('');

    try {
      const supabase = createClient();
      const keysResponse = await supabase
        .from('admin_exam_key_overview')
        .select('id,code,exam_room_name,subject_name,student_name,is_public,total_attempts,used_attempts,status,expires_at,created_at')
        .order('created_at', { ascending: false })
        .limit(200);

      if (keysResponse.error) throw keysResponse.error;

      const loadedKeys = ((keysResponse.data ?? []) as unknown as AdminExamKeyRecord[]).map(mapKeyRecord);
      setKeys(loadedKeys);
    } catch (error) {
      setKeyFeedback(getAdminDataErrorMessage(error));
    } finally {
      setIsLoadingKeys(false);
    }
  }, [hasConfiguredSupabase]);

  const loadExamResults = useCallback(async () => {
    if (!hasConfiguredSupabase) return;

    setIsLoadingResults(true);
    setResultsFeedback('');

    try {
      const supabase = createClient();
      const { data, error } = await supabase.rpc('get_exam_results', {
        p_limit: 1000,
      });

      if (error) throw error;

      const loaded = ((data ?? []) as unknown as ExamResultRecord[]).map(mapExamResult);
      setResults(loaded);
    } catch (error) {
      setResultsFeedback(getAdminDataErrorMessage(error));
    } finally {
      setIsLoadingResults(false);
    }
  }, [hasConfiguredSupabase]);

  const loadRooms = useCallback(async () => {
    if (!hasConfiguredSupabase) return;

    setIsLoadingRooms(true);
    setRoomsFeedback('');

    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('admin_exam_room_summary')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      setRooms(((data ?? []) as unknown as ExamRoomRecord[]).map(mapExamRoom));
    } catch (error) {
      setRoomsFeedback(getRoomErrorMessage(error));
    } finally {
      setIsLoadingRooms(false);
    }
  }, [hasConfiguredSupabase]);

  const loadPendingEssays = useCallback(async () => {
    if (!hasConfiguredSupabase) return;

    setIsLoadingEssays(true);
    setEssaysFeedback('');

    try {
      const supabase = createClient();
      const { data, error } = await supabase.rpc('get_pending_essays', { p_limit: 500 });
      if (error) throw error;
      setPendingEssays(((data ?? []) as unknown as PendingEssayRecord[]).map(mapPendingEssay));
    } catch (error) {
      setEssaysFeedback(getAdminDataErrorMessage(error));
    } finally {
      setIsLoadingEssays(false);
    }
  }, [hasConfiguredSupabase]);

  useEffect(() => {
    if (!hasConfiguredSupabase) return;

    const timeoutId = window.setTimeout(() => {
      void loadAdminCatalog();
      void loadKeyManagement();
      void loadExamResults();
      void loadRooms();
      void loadPendingEssays();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [
    hasConfiguredSupabase,
    loadAdminCatalog,
    loadKeyManagement,
    loadExamResults,
    loadRooms,
    loadPendingEssays,
  ]);

  const changeTab = useCallback((tab: TabId) => {
    setActiveTab(tab);
    const hash = TABS.find((item) => item.id === tab)?.hash ?? '';
    if (hash && window.location.hash !== hash) window.history.pushState(null, '', hash);
    topbarRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  useEffect(() => {
    const syncTabFromLocation = () => {
      const tab = tabFromHash(window.location.hash);
      setActiveTab(tab);
      const targetId = TABS.find((item) => item.id === tab)?.hash.slice(1);
      if (targetId) {
        window.requestAnimationFrame(() => document.getElementById(targetId)?.scrollIntoView({ block: 'start' }));
      }
    };
    window.addEventListener('hashchange', syncTabFromLocation);
    window.addEventListener('popstate', syncTabFromLocation);
    return () => {
      window.removeEventListener('hashchange', syncTabFromLocation);
      window.removeEventListener('popstate', syncTabFromLocation);
    };
  }, []);

  const handleRefreshAll = useCallback(() => {
    void loadAdminCatalog();
    void loadKeyManagement();
    void loadExamResults();
    void loadRooms();
    void loadPendingEssays();
  }, [loadAdminCatalog, loadKeyManagement, loadExamResults, loadRooms, loadPendingEssays]);

  const closeDialog = useCallback(() => {
    if (dialogBusy) return;
    setDialog(null);
  }, [dialogBusy]);

  const submitDialog = useCallback(
    async (value?: string) => {
      if (!dialog || dialogBusy) return;
      setDialogBusy(true);
      try {
        if (dialog.kind === 'prompt') {
          await dialog.onConfirm(value ?? '');
        } else {
          await dialog.onConfirm();
        }
        setDialog(null);
      } finally {
        setDialogBusy(false);
      }
    },
    [dialog, dialogBusy],
  );

  const filteredStudents = useMemo(() => {
    const nextSearch = deferredStudentSearch.trim().toLowerCase();
    if (!nextSearch) return students;

    return students.filter((student) =>
      [student.code, student.name, student.school, student.key].some((value) =>
        value.toLowerCase().includes(nextSearch),
      ),
    );
  }, [deferredStudentSearch, students]);

  const filteredQuestions = useMemo(() => {
    const search = deferredQuestionSearch.trim().toLowerCase();
    return questions.filter((question) => {
      if (questionSubject && question.subjectCode !== questionSubject) return false;
      if (questionDifficulty && String(question.difficultyLevel) !== questionDifficulty) return false;
      if (questionStatusFilter && question.status !== questionStatusFilter) return false;
      if (
        search &&
        ![question.code, question.title, question.subject].some((value) =>
          value.toLowerCase().includes(search),
        )
      ) {
        return false;
      }
      return true;
    });
  }, [questions, deferredQuestionSearch, questionSubject, questionDifficulty, questionStatusFilter]);

  const resultSubjectOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const result of results) {
      if (result.subjectCode) map.set(result.subjectCode, result.subjectName);
    }
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1], 'vi'));
  }, [results]);

  const resultRoomOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const result of results) {
      if (
        result.roomCode &&
        (!resultFilterSubject || result.subjectCode === resultFilterSubject)
      ) {
        map.set(result.roomCode, result.roomName);
      }
    }
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1], 'vi'));
  }, [results, resultFilterSubject]);

  const filteredResults = useMemo(() => {
    return results.filter((result) => {
      if (resultFilterSubject && result.subjectCode !== resultFilterSubject) return false;
      if (resultFilterRoom && result.roomCode !== resultFilterRoom) return false;
      if (resultFilterStatus && result.status !== resultFilterStatus) return false;
      return true;
    });
  }, [results, resultFilterSubject, resultFilterRoom, resultFilterStatus]);

  // Tìm kiếm key/phòng thi: UI search phục vụ lọc server-side sau này.
  // Hiện tại giữ API cũ (lọc trên 200 dòng đã tải), TODO(server-search):
  // chuyển thành query Supabase (ilike + range cursor) khi có API hỗ trợ.
  const filteredKeys = useMemo(() => {
    const search = deferredKeySearch.trim().toLowerCase();
    return keys.filter((key) => {
      if (keyStatusFilter && key.rawStatus !== keyStatusFilter) return false;
      if (
        search &&
        ![key.code, key.student, key.room, key.subject].some((value) =>
          value.toLowerCase().includes(search),
        )
      ) {
        return false;
      }
      return true;
    });
  }, [keys, deferredKeySearch, keyStatusFilter]);

  const filteredRooms = useMemo(() => {
    const search = deferredRoomSearch.trim().toLowerCase();
    return rooms.filter((room) => {
      if (roomStatusFilter && room.status !== roomStatusFilter) return false;
      if (
        search &&
        ![room.code, room.name, room.subjectName].some((value) =>
          value.toLowerCase().includes(search),
        )
      ) {
        return false;
      }
      return true;
    });
  }, [rooms, deferredRoomSearch, roomStatusFilter]);

  // Reset về trang 1 khi filter/search đổi: thực hiện ngay trong onChange
  // (không dùng effect để tránh cascading renders). Các memo phân trang
  // vẫn clamp page nên dữ liệu mới không bao giờ tràn trang.

  const pagedResults = useMemo(() => {
    const pageCount = Math.max(1, Math.ceil(filteredResults.length / RESULTS_PAGE_SIZE));
    const page = Math.min(resultsPage, pageCount);
    return {
      page,
      pageCount,
      rows: filteredResults.slice((page - 1) * RESULTS_PAGE_SIZE, page * RESULTS_PAGE_SIZE),
    };
  }, [filteredResults, resultsPage]);

  const pagedQuestions = useMemo(() => {
    const pageCount = Math.max(1, Math.ceil(filteredQuestions.length / QUESTIONS_PAGE_SIZE));
    const page = Math.min(questionsPage, pageCount);
    return {
      page,
      pageCount,
      rows: filteredQuestions.slice((page - 1) * QUESTIONS_PAGE_SIZE, page * QUESTIONS_PAGE_SIZE),
    };
  }, [filteredQuestions, questionsPage]);

  const pagedKeys = useMemo(() => {
    const pageCount = Math.max(1, Math.ceil(filteredKeys.length / KEYS_PAGE_SIZE));
    const page = Math.min(keysPage, pageCount);
    return {
      page,
      pageCount,
      rows: filteredKeys.slice((page - 1) * KEYS_PAGE_SIZE, page * KEYS_PAGE_SIZE),
    };
  }, [filteredKeys, keysPage]);

  const pagedRooms = useMemo(() => {
    const pageCount = Math.max(1, Math.ceil(filteredRooms.length / ROOMS_PAGE_SIZE));
    const page = Math.min(roomsPage, pageCount);
    return {
      page,
      pageCount,
      rows: filteredRooms.slice((page - 1) * ROOMS_PAGE_SIZE, page * ROOMS_PAGE_SIZE),
    };
  }, [filteredRooms, roomsPage]);

  const pagedStudents = useMemo(() => {
    const pageCount = Math.max(1, Math.ceil(filteredStudents.length / STUDENTS_PAGE_SIZE));
    const page = Math.min(studentsPage, pageCount);
    return {
      page,
      pageCount,
      rows: filteredStudents.slice((page - 1) * STUDENTS_PAGE_SIZE, page * STUDENTS_PAGE_SIZE),
    };
  }, [filteredStudents, studentsPage]);

  const pagedEssays = useMemo(() => {
    const pageCount = Math.max(1, Math.ceil(pendingEssays.length / ESSAYS_PAGE_SIZE));
    const page = Math.min(essaysPage, pageCount);
    return {
      page,
      pageCount,
      rows: pendingEssays.slice((page - 1) * ESSAYS_PAGE_SIZE, page * ESSAYS_PAGE_SIZE),
    };
  }, [pendingEssays, essaysPage]);

  const resultStats = useMemo(() => {
    const total = filteredResults.length;
    let submitted = 0;
    let inProgress = 0;
    let scoreSum = 0;
    let scoredCount = 0;

    for (const result of filteredResults) {
      if (result.status === 'in_progress') inProgress += 1;
      else submitted += 1;

      const normalized = normalizedScore(result);
      if (normalized !== null) {
        scoreSum += normalized;
        scoredCount += 1;
      }
    }

    return {
      total,
      submitted,
      inProgress,
      scoredCount,
      average: scoredCount > 0 ? scoreSum / scoredCount : null,
    };
  }, [filteredResults]);

  const keyStats = useMemo(() => {
    let active = 0;
    let expired = 0;
    for (const key of keys) {
      if (activeKeyStatuses.has(key.status)) active += 1;
      if (key.rawStatus === 'expired' || key.rawStatus === 'exhausted') expired += 1;
    }
    return { total: keys.length, active, expired };
  }, [keys]);

  const roomStats = useMemo(() => {
    let published = 0;
    let draft = 0;
    for (const room of rooms) {
      if (room.status === 'published') published += 1;
      if (room.status === 'draft') draft += 1;
    }
    return { total: rooms.length, published, draft };
  }, [rooms]);

  const handleExportResults = () => {
    if (filteredResults.length === 0) return;
    downloadCsv(`ket-qua-thi_${hanoiTodayInputValue()}.csv`, buildResultsCsv(filteredResults));
    showToast(`Đã xuất ${filteredResults.length} dòng kết quả ra CSV.`, 'success');
  };

  const handleExportKeys = () => {
    if (filteredKeys.length === 0) return;
    downloadCsv(`keys_${hanoiTodayInputValue()}.csv`, buildKeysCsv(filteredKeys));
    showToast(`Đã xuất ${filteredKeys.length} key ra CSV.`, 'success');
  };

  const handleExportRooms = () => {
    if (filteredRooms.length === 0) return;
    downloadCsv(`phong-thi_${hanoiTodayInputValue()}.csv`, buildRoomsCsv(filteredRooms));
    showToast(`Đã xuất ${filteredRooms.length} phòng thi ra CSV.`, 'success');
  };

  const handleExportStudents = () => {
    if (filteredStudents.length === 0) return;
    downloadCsv(`hoc-vien_${hanoiTodayInputValue()}.csv`, buildStudentsCsv(filteredStudents));
    showToast(`Đã xuất ${filteredStudents.length} học viên ra CSV.`, 'success');
  };

  const handleExportQuestions = () => {
    if (filteredQuestions.length === 0) return;
    downloadCsv(`cau-hoi_${hanoiTodayInputValue()}.csv`, buildQuestionsCsv(filteredQuestions));
    showToast(`Đã xuất ${filteredQuestions.length} câu hỏi ra CSV.`, 'success');
  };

  const blueprintsForSubject = useMemo(
    () => blueprints.filter((blueprint) => blueprint.subjectCode === roomForm.subjectCode),
    [blueprints, roomForm.subjectCode],
  );

  const resetRoomForm = () => {
    setRoomForm(emptyRoomForm);
    setEditingRoomId(null);
  };

  const handleEditRoom = (room: ExamRoom) => {
    changeTab('rooms');
    setEditingRoomId(room.id);
    setRoomForm({
      name: room.name,
      code: room.code,
      subjectCode: room.subjectCode,
      blueprintId: room.blueprintId,
      durationMinutes: String(room.durationMinutes),
      totalAttempts: String(room.totalAttempts),
      priceVnd: String(room.priceVnd),
      startsAt: isoToLocalInput(room.startsAt),
      endsAt: isoToLocalInput(room.endsAt),
      status: room.status,
    });
    setRoomsFeedback('');
    window.setTimeout(() => {
      document.getElementById('room-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 60);
  };

  const handleSubmitRoom = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!hasConfiguredSupabase) {
      setRoomsFeedback('Chưa cấu hình Supabase nên không thể lưu phòng thi.');
      return;
    }

    const name = roomForm.name.trim();
    const code = roomForm.code.trim().toUpperCase();
    const duration = Number.parseInt(roomForm.durationMinutes, 10);
    const attempts = Number.parseInt(roomForm.totalAttempts, 10);
    const price = Number.parseInt(roomForm.priceVnd, 10);

    if (!name || !code) {
      setRoomsFeedback('Nhập tên và mã phòng.');
      return;
    }
    if (!roomForm.subjectCode) {
      setRoomsFeedback('Chọn môn học cho phòng.');
      return;
    }
    if (!roomForm.blueprintId) {
      setRoomsFeedback('Chọn khung đề (blueprint) cùng môn.');
      return;
    }
    if (!Number.isInteger(duration) || duration < 1) {
      setRoomsFeedback('Thời lượng phải là số phút lớn hơn 0.');
      return;
    }
    if (!Number.isInteger(attempts) || attempts < 1) {
      setRoomsFeedback('Số lượt mặc định phải từ 1 trở lên.');
      return;
    }

    const startsAt = localInputToIso(roomForm.startsAt);
    const endsAt = localInputToIso(roomForm.endsAt);
    if (startsAt && endsAt && new Date(endsAt) <= new Date(startsAt)) {
      setRoomsFeedback('Thời điểm đóng phải sau thời điểm mở.');
      return;
    }

    const payload = {
      name,
      code,
      subject_code: roomForm.subjectCode,
      blueprint_id: roomForm.blueprintId,
      duration_minutes: duration,
      total_attempts_default: attempts,
      price_vnd: Number.isInteger(price) && price >= 0 ? price : 0,
      starts_at: startsAt,
      ends_at: endsAt,
      status: roomForm.status,
      published_at: roomForm.status === 'published' ? new Date().toISOString() : null,
    };

    setIsSavingRoom(true);
    setRoomsFeedback('');

    try {
      const supabase = createClient();
      if (editingRoomId) {
        const { error } = await supabase.from('exam_rooms').update(payload).eq('id', editingRoomId);
        if (error) throw error;
        setRoomsFeedback(`Đã cập nhật phòng ${code}.`);
        showToast(`Đã cập nhật phòng ${code}.`, 'success');
      } else {
        const { error } = await supabase.from('exam_rooms').insert(payload);
        if (error) throw error;
        setRoomsFeedback(`Đã tạo phòng ${code}.`);
        showToast(`Đã tạo phòng ${code}.`, 'success');
      }
      resetRoomForm();
      await loadRooms();
    } catch (error) {
      const message = getRoomErrorMessage(error);
      setRoomsFeedback(message);
      showToast(message, 'error');
    } finally {
      setIsSavingRoom(false);
    }
  };

  const doRoomStatus = async (room: ExamRoom, status: ExamRoomStatus) => {
    try {
      const patch: { status: ExamRoomStatus; published_at?: string | null } = { status };
      if (status === 'published') patch.published_at = new Date().toISOString();
      const { error } = await createClient().from('exam_rooms').update(patch).eq('id', room.id);
      if (error) throw error;
      showToast(`Đã cập nhật phòng ${room.code}.`, 'success');
      await loadRooms();
    } catch (error) {
      const message = getRoomErrorMessage(error);
      setRoomsFeedback(message);
      showToast(message, 'error');
    }
  };

  const handleRoomStatus = (room: ExamRoom, status: ExamRoomStatus) => {
    if (!hasConfiguredSupabase) return;
    if (status !== 'archived') {
      void doRoomStatus(room, status);
      return;
    }
    setDialog({
      id: ++dialogSeq,
      kind: 'confirm',
      title: `Đóng phòng ${room.code}?`,
      desc: 'Thí sinh sẽ không vào thi được nữa. Có thể mở lại bất cứ lúc nào.',
      confirmLabel: 'Đóng phòng',
      danger: true,
      onConfirm: () => doRoomStatus(room, status),
    });
  };

  const doDeleteRoom = async (room: ExamRoom) => {
    try {
      const { error } = await createClient()
        .from('exam_rooms')
        .update({ status: 'draft', deleted_at: new Date().toISOString() })
        .eq('id', room.id);
      if (error) throw error;
      if (editingRoomId === room.id) resetRoomForm();
      showToast(`Đã lưu trữ phòng ${room.code}.`, 'success');
      await loadRooms();
    } catch (error) {
      const message = getRoomErrorMessage(error);
      setRoomsFeedback(message);
      showToast(message, 'error');
    }
  };

  const handleDeleteRoom = (room: ExamRoom) => {
    if (!hasConfiguredSupabase) return;
    setDialog({
      id: ++dialogSeq,
      kind: 'confirm',
      title: `Lưu trữ phòng ${room.code}?`,
      desc: 'Phòng sẽ bị ẩn; thí sinh chỉ còn xem điểm, không xem được đề thi, bài làm hoặc đáp án.',
      confirmLabel: 'Lưu trữ',
      danger: true,
      onConfirm: () => doDeleteRoom(room),
    });
  };

  const handleGradeEssay = async (essay: PendingEssay) => {
    if (!hasConfiguredSupabase) return;

    const raw = (essayScores[essay.answerId] ?? '').trim().replace(',', '.');
    const points = Number(raw);
    if (raw === '' || !Number.isFinite(points) || points < 0) {
      setEssaysFeedback('Nhập điểm hợp lệ (số ≥ 0).');
      return;
    }
    if (points > essay.maxPoints) {
      setEssaysFeedback(`Điểm không được vượt quá ${essay.maxPoints}.`);
      return;
    }

    setGradingId(essay.answerId);
    setEssaysFeedback('');

    try {
      const { error } = await createClient().rpc('grade_essay_answer', {
        p_answer_id: essay.answerId,
        p_points: points,
      });
      if (error) throw error;

      setEssaysFeedback(`Đã chấm ${essay.studentName}: ${points}/${essay.maxPoints} điểm.`);
      showToast(`Đã chấm ${essay.studentName}: ${points}/${essay.maxPoints}.`, 'success');
      setEssayScores((current) => {
        const next = { ...current };
        delete next[essay.answerId];
        return next;
      });
      await loadPendingEssays();
      await loadExamResults();
    } catch (error) {
      const message = getAdminDataErrorMessage(error);
      setEssaysFeedback(message);
      showToast(message, 'error');
    } finally {
      setGradingId(null);
    }
  };

  const doDeleteSubject = async (code: string) => {
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from('subjects')
        .update({ is_active: false })
        .eq('code', code);
      if (error) throw error;
      showToast(`Đã lưu trữ môn ${code}.`, 'success');
      await loadAdminCatalog();
    } catch (error) {
      const message = getAdminDataErrorMessage(error);
      setCatalogFeedback(message);
      showToast(message, 'error');
    }
  };

  const handleDeleteSubject = (code: string) => {
    if (!hasConfiguredSupabase) {
      setCatalogFeedback('Chưa cấu hình Supabase nên không thể lưu trữ môn học.');
      return;
    }
    setDialog({
      id: ++dialogSeq,
      kind: 'confirm',
      title: `Lưu trữ môn học ${code}?`,
      desc: 'Dữ liệu liên quan được giữ nguyên. Môn sẽ chuyển sang trạng thái Nháp.',
      confirmLabel: 'Lưu trữ',
      onConfirm: () => doDeleteSubject(code),
    });
  };

  const handleAddSubject = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = String(form.get('subjectName') ?? '').trim();
    const code = String(form.get('subjectCode') ?? '').trim().toUpperCase();
    const duration = Number(form.get('duration') ?? 90);

    if (!name || !code) return;

    if (!hasConfiguredSupabase) {
      setCatalogFeedback('Chưa cấu hình Supabase nên không thể lưu môn học.');
      return;
    }

    try {
      const { error } = await createClient().from('subjects').upsert(
        {
          code,
          name,
          exam_group: 'custom',
          default_duration_minutes: duration,
          is_compulsory: false,
          is_active: true,
        },
        { onConflict: 'code' },
      );

      if (error) throw error;

      event.currentTarget.reset();
      showToast(`Đã lưu môn ${code}.`, 'success');
      await loadAdminCatalog();
    } catch (error) {
      const message = getAdminDataErrorMessage(error);
      setCatalogFeedback(message);
      showToast(message, 'error');
    }
  };

  const handleChangeQuestionStatus = async (question: DraftQuestion, status: QuestionStatus) => {
    if (!hasConfiguredSupabase || status === question.status) return;

    // Optimistic: cập nhật ngay, rollback bằng reload nếu lỗi.
    setQuestions((current) =>
      current.map((item) => (item.id === question.id ? { ...item, status } : item)),
    );

    try {
      const { error } = await createClient()
        .from('questions')
        .update({ status })
        .eq('id', question.id);
      if (error) throw error;
    } catch (error) {
      const message = getAdminDataErrorMessage(error);
      setCatalogFeedback(message);
      showToast(message, 'error');
      await loadAdminCatalog();
    }
  };

  const doDeleteQuestion = async (question: DraftQuestion) => {
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from('questions')
        .update({ status: 'archived', deleted_at: new Date().toISOString() })
        .eq('id', question.id);
      if (error) throw error;
      showToast(`Đã lưu trữ câu hỏi ${question.code}.`, 'success');
      await loadAdminCatalog();
    } catch (error) {
      const message = getAdminDataErrorMessage(error);
      setCatalogFeedback(message);
      showToast(message, 'error');
    }
  };

  const handleDeleteQuestion = (question: DraftQuestion) => {
    if (!hasConfiguredSupabase) return;
    setDialog({
      id: ++dialogSeq,
      kind: 'confirm',
      title: `Lưu trữ câu hỏi ${question.code}?`,
      desc: 'Câu hỏi sẽ bị ẩn nhưng lịch sử thi được giữ nguyên.',
      confirmLabel: 'Lưu trữ',
      danger: true,
      onConfirm: () => doDeleteQuestion(question),
    });
  };

  const handleCreateKeys = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const quantity = Number.parseInt(keyQuantity, 10);
    const totalAttempts = Number.parseInt(keyTotalAttempts, 10);

    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 500) {
      setKeyFeedback('Số lượng key phải từ 1 đến 500.');
      return;
    }

    if (!Number.isInteger(totalAttempts) || totalAttempts < 1 || totalAttempts > 100000) {
      setKeyFeedback('Giới hạn lượt làm phải từ 1 đến 100.000.');
      return;
    }

    const expiresAt = keyExpiry ? getEndOfDayIso(keyExpiry) : null;

    if (expiresAt && new Date(expiresAt) <= new Date()) {
      setKeyFeedback('Ngày hết hạn phải nằm trong tương lai.');
      return;
    }

    if (!hasConfiguredSupabase) {
      setKeyFeedback('Chưa cấu hình Supabase nên không thể tạo key.');
      return;
    }

    const isPublicKey = keyMode === 'public';

    setIsCreatingKeys(true);
    setKeyFeedback('');

    try {
      const supabase = createClient();
      const { data, error } = await supabase.rpc('generate_exam_keys', {
        p_exam_room_id: null as unknown as string,
        p_quantity: quantity,
        p_expires_at: expiresAt as string,
        p_note: (keyNote.trim() || null) as unknown as string,
        p_total_attempts: totalAttempts,
        p_is_public: isPublicKey,
      });

      if (error) throw error;

      const createdKeys = ((data ?? []) as unknown as GeneratedExamKeyRecord[]).map((key) => ({
        id: key.id,
        code: key.code,
        subject: key.subject_code ?? 'Dùng chung',
        room: key.exam_room_name ?? 'Dùng cho mọi phòng thi',
        student: key.is_public ? 'Nhiều tài khoản' : 'Chưa gán',
        isPublic: key.is_public,
        attempts: `${key.used_attempts}/${key.total_attempts}`,
        status: keyStatusLabels[key.status],
        rawStatus: key.status,
        usedAttempts: key.used_attempts,
        expiresAt: key.expires_at,
        createdAt: key.created_at,
      }));

      setKeys((current) => [...createdKeys, ...current]);
      setKeyNote('');
      const doneMessage = `Đã tạo ${createdKeys.length || quantity} key trong cơ sở dữ liệu.`;
      setKeyFeedback(doneMessage);
      showToast(doneMessage, 'success');
      await loadKeyManagement();
    } catch (error) {
      const message = getErrorMessage(error);
      setKeyFeedback(message);
      showToast(message, 'error');
    } finally {
      setIsCreatingKeys(false);
    }
  };

  const doRevokeKey = async (key: ExamKey) => {
    try {
      const { error } = await createClient()
        .from('exam_keys')
        .update({ status: 'revoked' })
        .eq('id', key.id);
      if (error) throw error;
      setKeyFeedback(`Đã thu hồi key ${key.code}.`);
      showToast(`Đã thu hồi key ${key.code}.`, 'success');
      await loadKeyManagement();
    } catch (error) {
      const message = getAdminDataErrorMessage(error);
      setKeyFeedback(message);
      showToast(message, 'error');
    }
  };

  const handleRevokeKey = (key: ExamKey) => {
    if (!hasConfiguredSupabase) return;
    setDialog({
      id: ++dialogSeq,
      kind: 'confirm',
      title: `Thu hồi key ${key.code}?`,
      desc: 'Thí sinh sẽ không dùng key này để vào thi được nữa.',
      confirmLabel: 'Thu hồi',
      danger: true,
      onConfirm: () => doRevokeKey(key),
    });
  };

  const doExtendKey = async (key: ExamKey, trimmed: string) => {
    const expiresAt = getEndOfDayIso(trimmed);
    if (new Date(expiresAt) <= new Date()) {
      setKeyFeedback('Ngày hết hạn phải nằm trong tương lai.');
      return;
    }

    // Key đang 'expired' mà gia hạn về tương lai -> mở lại theo số lượt đã dùng.
    const reopenStatus: ExamKeyStatus | undefined =
      key.rawStatus === 'expired'
        ? key.usedAttempts > 0
          ? 'active'
          : 'unused'
        : undefined;

    try {
      const patch: { expires_at: string; status?: ExamKeyStatus } = { expires_at: expiresAt };
      if (reopenStatus) patch.status = reopenStatus;

      const { error } = await createClient().from('exam_keys').update(patch).eq('id', key.id);
      if (error) throw error;
      const doneMessage = `Đã gia hạn key ${key.code} đến ${formatDate(expiresAt)}.`;
      setKeyFeedback(doneMessage);
      showToast(doneMessage, 'success');
      await loadKeyManagement();
    } catch (error) {
      const message = getAdminDataErrorMessage(error);
      setKeyFeedback(message);
      showToast(message, 'error');
    }
  };

  const handleExtendKey = (key: ExamKey) => {
    if (!hasConfiguredSupabase) return;
    if (key.rawStatus === 'revoked') return;
    const suggestion = key.expiresAt
      ? hanoiTodayInputValue(new Date(key.expiresAt))
      : getDefaultExpiryDate();
    setDialog({
      id: ++dialogSeq,
      kind: 'prompt',
      title: `Gia hạn key ${key.code}`,
      desc: 'Nhập ngày hết hạn mới. Key hết hạn mà gia hạn về tương lai sẽ tự mở lại.',
      label: 'Ngày hết hạn mới (YYYY-MM-DD)',
      defaultValue: suggestion,
      inputType: 'date',
      confirmLabel: 'Gia hạn',
      onConfirm: (value: string) => {
        const trimmed = value.trim();
        if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
          setKeyFeedback('Ngày không hợp lệ. Định dạng đúng: YYYY-MM-DD.');
          return;
        }
        return doExtendKey(key, trimmed);
      },
    });
  };

  const doDeleteKey = async (key: ExamKey) => {
    try {
      const { error } = await createClient()
        .from('exam_keys')
        .update({ status: 'revoked', deleted_at: new Date().toISOString() })
        .eq('id', key.id);
      if (error) throw error;
      setKeyFeedback(`Đã thu hồi và lưu trữ key ${key.code}.`);
      showToast(`Đã thu hồi và lưu trữ key ${key.code}.`, 'success');
      await loadKeyManagement();
    } catch (error) {
      const message = getAdminDataErrorMessage(error);
      setKeyFeedback(message);
      showToast(message, 'error');
    }
  };

  const handleDeleteKey = (key: ExamKey) => {
    if (!hasConfiguredSupabase) return;
    setDialog({
      id: ++dialogSeq,
      kind: 'confirm',
      title: `Thu hồi và lưu trữ key ${key.code}?`,
      desc: 'Key bị thu hồi và ẩn khỏi danh sách hoạt động.',
      confirmLabel: 'Thu hồi & lưu trữ',
      danger: true,
      onConfirm: () => doDeleteKey(key),
    });
  };

  const goToKeys = () => {
    changeTab('keys');
    window.setTimeout(() => {
      document.getElementById('key-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 60);
  };

  const activeKeyCount = keyStats.active;
  const activeTabMeta = TABS.find((tab) => tab.id === activeTab) ?? TABS[0];

  return (
    <div className={styles.screen}>
      <aside className={styles.sidebar} aria-label="Điều hướng quản trị">
        <div className={styles.brand}>
          <span className={styles.brandIcon} aria-hidden="true"><ShieldCheck size={20} /></span>
          <span>Admin THPT</span>
        </div>
        <nav className={styles.nav} aria-label="Phân hệ quản trị">
          {TABS.map((tab) => (
            <a
              key={tab.id}
              href={tab.hash}
              onClick={(event) => {
                event.preventDefault();
                changeTab(tab.id);
              }}
              aria-current={activeTab === tab.id ? 'page' : undefined}
              className={`${styles.navLink} ${activeTab === tab.id ? styles.navLinkActive : ''}`}
            >
              {tab.id === 'overview' ? <BarChart3 size={18} aria-hidden="true" /> : null}
              {tab.id === 'rooms' ? <DoorOpen size={18} aria-hidden="true" /> : null}
              {tab.id === 'bank' ? <BookOpenCheck size={18} aria-hidden="true" /> : null}
              {tab.id === 'keys' ? <KeyRound size={18} aria-hidden="true" /> : null}
              {tab.id === 'grading' ? <ClipboardCheck size={18} aria-hidden="true" /> : null}
              {tab.label}
            </a>
          ))}
          <span aria-hidden="true" style={{ borderTop: '1px solid var(--border)', margin: '8px 4px' }} />
          <Link href="/admin/content-quality"><FilePenLine size={18} aria-hidden="true" /> Chất lượng ND</Link>
          <Link href="/admin/key-products"><KeyRound size={18} aria-hidden="true" /> Gói mua key</Link>
          <Link href="/admin/purchases"><ClipboardCheck size={18} aria-hidden="true" /> Đơn ThueAPIBank</Link>
        </nav>
        <button className={styles.backButton} type="button" onClick={() => router.push('/subjects')}>
          Về giao diện thi
        </button>
      </aside>

      <main className={styles.main} id="main">
        <div className={styles.topbar} ref={topbarRef}>
          <div className={styles.topbarTitle}>
            <h1>{activeTabMeta.label}</h1>
            <p>{activeTabMeta.description}</p>
          </div>
          <button
            className="btn outline small"
            type="button"
            onClick={handleRefreshAll}
            disabled={!hasConfiguredSupabase}
          >
            <RefreshCw size={15} aria-hidden="true" />
            Tải lại tất cả
          </button>
          <button className="btn small" type="button" onClick={goToKeys}>
            <Plus size={16} aria-hidden="true" />
            Tạo key
          </button>
        </div>

        <div className={styles.tabs} role="tablist" aria-label="Phân hệ quản trị">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.id}
              aria-controls={tab.hash.slice(1)}
              tabIndex={activeTab === tab.id ? 0 : -1}
              id={`admin-tab-${tab.id}`}
              className={`${styles.tab} ${activeTab === tab.id ? styles.tabActive : ''}`}
              onClick={() => changeTab(tab.id)}
              onKeyDown={(event) => {
                const currentIndex = TABS.findIndex((item) => item.id === tab.id);
                let nextIndex = currentIndex;
                if (event.key === 'ArrowRight' || event.key === 'ArrowDown') nextIndex = (currentIndex + 1) % TABS.length;
                else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') nextIndex = (currentIndex - 1 + TABS.length) % TABS.length;
                else if (event.key === 'Home') nextIndex = 0;
                else if (event.key === 'End') nextIndex = TABS.length - 1;
                else return;
                event.preventDefault();
                const nextTab = TABS[nextIndex];
                changeTab(nextTab.id);
                window.requestAnimationFrame(() => document.getElementById(`admin-tab-${nextTab.id}`)?.focus());
              }}
            >
              {tab.label}
              {tab.id === 'overview' ? <span className={styles.tabCount}>{resultStats.total}</span> : null}
              {tab.id === 'rooms' ? <span className={styles.tabCount}>{roomStats.total}</span> : null}
              {tab.id === 'bank' ? <span className={styles.tabCount}>{questions.length}</span> : null}
              {tab.id === 'keys' ? <span className={styles.tabCount}>{keyStats.total}</span> : null}
              {tab.id === 'grading' ? <span className={styles.tabCount}>{pendingEssays.length}</span> : null}
            </button>
          ))}
        </div>

        <section className={styles.metrics} aria-label="Tổng quan">
          <div className={styles.metric}>
            <BookOpenCheck size={20} aria-hidden="true" />
            <span>{subjects.length}</span>
            <p>Môn học</p>
          </div>
          <div className={styles.metric}>
            <FilePenLine size={20} aria-hidden="true" />
            <span>{questions.length}</span>
            <p>Câu hỏi</p>
          </div>
          <div className={styles.metric}>
            <KeyRound size={20} aria-hidden="true" />
            <span>{activeKeyCount}</span>
            <p>Key còn hiệu lực</p>
          </div>
          <div className={styles.metric}>
            <GraduationCap size={20} aria-hidden="true" />
            <span>{students.length}</span>
            <p>Học viên</p>
          </div>
        </section>

        {activeTab === 'overview' ? (
          <section id="results" className={styles.panel} role="tabpanel" aria-labelledby="admin-tab-overview">
            <div className={styles.panelHeader}>
              <div>
                <h2>Kết quả thi</h2>
                <p>Điểm và lượt thi của thí sinh theo phòng/môn. Hiển thị tối đa 1.000 phiên gần nhất.</p>
              </div>
              <button
                className="btn outline small"
                type="button"
                onClick={() => void loadExamResults()}
                disabled={isLoadingResults || !hasConfiguredSupabase}
              >
                <RefreshCw size={15} aria-hidden="true" />
                Tải lại
              </button>
            </div>

            <div className={styles.resultStats}>
              <div className={styles.resultStat}>
                <span>{resultStats.total}</span>
                <p>Phiên thi</p>
              </div>
              <div className={styles.resultStat}>
                <span>{resultStats.submitted}</span>
                <p>Đã hoàn thành</p>
              </div>
              <div className={styles.resultStat}>
                <span>{resultStats.inProgress}</span>
                <p>Đang làm</p>
              </div>
              <div className={styles.resultStat}>
                <span>{resultStats.average === null ? '—' : resultStats.average.toFixed(2)}</span>
                <p>Điểm TB (/10)</p>
              </div>
            </div>

            <div className={styles.resultToolbar}>
              <div className={styles.resultFilters}>
                <label>
                  Môn
                  <select
                    value={resultFilterSubject}
                    onChange={(event) => {
                      setResultFilterSubject(event.target.value);
                      setResultFilterRoom('');
                      setResultsPage(1);
                    }}
                    aria-label="Lọc theo môn"
                  >
                    <option value="">Tất cả môn</option>
                    {resultSubjectOptions.map(([code, name]) => (
                      <option key={code} value={code}>{name}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Phòng thi
                  <select
                    value={resultFilterRoom}
                    onChange={(event) => {
                      setResultFilterRoom(event.target.value);
                      setResultsPage(1);
                    }}
                    aria-label="Lọc theo phòng thi"
                  >
                    <option value="">Tất cả phòng</option>
                    {resultRoomOptions.map(([code, name]) => (
                      <option key={code} value={code}>{name}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Trạng thái
                  <select
                    value={resultFilterStatus}
                    onChange={(event) => {
                      setResultFilterStatus(event.target.value);
                      setResultsPage(1);
                    }}
                    aria-label="Lọc theo trạng thái"
                  >
                    {examStatusFilterOptions.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </label>
              </div>
              <button
                className="btn secondary small"
                type="button"
                onClick={handleExportResults}
                disabled={filteredResults.length === 0}
              >
                <Download size={16} aria-hidden="true" />
                Xuất CSV
              </button>
            </div>

            {resultsFeedback ? <p className={styles.feedback} role="status" aria-live="polite">{resultsFeedback}</p> : null}

            {isLoadingResults && results.length === 0 ? (
              <PanelSkeleton rows={5} />
            ) : pagedResults.rows.length === 0 ? (
              <EmptyState
                icon={<Inbox size={28} aria-hidden="true" />}
                title={results.length === 0 ? 'Chưa có phiên thi nào' : 'Không khớp bộ lọc'}
                desc={results.length === 0 ? 'Khi thí sinh làm bài, kết quả sẽ hiện ở đây.' : 'Thử nới lỏng điều kiện lọc môn / phòng / trạng thái.'}
              />
            ) : (
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <caption className={styles.srOnly}>Kết quả thi của thí sinh</caption>
                  <thead>
                    <tr>
                      <th scope="col">Thí sinh</th>
                      <th scope="col">Trường</th>
                      <th scope="col">Môn</th>
                      <th scope="col">Phòng</th>
                      <th scope="col">Lượt</th>
                      <th scope="col">Điểm</th>
                      <th scope="col">Trạng thái</th>
                      <th scope="col">Rời tab</th>
                      <th scope="col">Nộp bài</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagedResults.rows.map((result) => (
                      <tr key={result.sessionId}>
                        <td><strong>{result.studentName}</strong></td>
                        <td>{result.school}</td>
                        <td>{result.subjectName}</td>
                        <td>{result.roomName}</td>
                        <td>{result.attempt}</td>
                        <td>
                          {result.score === null
                            ? '—'
                            : `${result.score.toFixed(2)} / ${result.maxScore}`}
                        </td>
                        <td><span className={styles.keyStatus}>{examStatusLabel(result.status, result.autoExpired)}</span></td>
                        <td>
                          {result.violations > 0
                            ? <strong className={styles.violationFlag}>{result.violations}</strong>
                            : '0'}
                        </td>
                        <td>{formatDateTime(result.submittedAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <PaginationBar
              page={pagedResults.page}
              pageCount={pagedResults.pageCount}
              total={filteredResults.length}
              unit="phiên thi"
              onPage={setResultsPage}
            />
          </section>
        ) : null}

        {activeTab === 'bank' ? (
          <div className={styles.workGrid}>
            <section id="compose" className={styles.panel} role="tabpanel" aria-labelledby="admin-tab-bank">
              <div className={styles.panelHeader}>
                <div>
                  <h2>Ngân hàng câu hỏi</h2>
                  <p>Câu hỏi hiển thị từ bảng questions trong Supabase.</p>
                </div>
                <span className={styles.status}>{isLoadingCatalog ? 'Đang tải' : 'Dữ liệu DB'}</span>
              </div>
              {catalogFeedback ? <p className={styles.feedback} role="status" aria-live="polite">{catalogFeedback}</p> : null}

              <div className={styles.questionFilters}>
                <label className={styles.search}>
                  <Search size={16} aria-hidden="true" />
                  <input
                    value={questionSearch}
                    onChange={(event) => {
                      setQuestionSearch(event.target.value);
                      setQuestionsPage(1);
                    }}
                    placeholder="Tìm mã hoặc nội dung... (lọc server khi có API)"
                    aria-label="Tìm câu hỏi"
                  />
                </label>
                <select value={questionSubject} onChange={(event) => {
                  setQuestionSubject(event.target.value);
                  setQuestionsPage(1);
                }} aria-label="Lọc câu hỏi theo môn">
                  <option value="">Tất cả môn</option>
                  {subjects.map((subject) => (
                    <option key={subject.code} value={subject.code}>{subject.name}</option>
                  ))}
                </select>
                <select value={questionDifficulty} onChange={(event) => {
                  setQuestionDifficulty(event.target.value);
                  setQuestionsPage(1);
                }} aria-label="Lọc câu hỏi theo độ khó">
                  <option value="">Mọi độ khó</option>
                  {questionDifficultyOptions.map((level) => (
                    <option key={level} value={String(level)}>{difficultyLabel(level)}</option>
                  ))}
                </select>
                <select value={questionStatusFilter} onChange={(event) => {
                  setQuestionStatusFilter(event.target.value);
                  setQuestionsPage(1);
                }} aria-label="Lọc câu hỏi theo trạng thái">
                  <option value="">Mọi trạng thái</option>
                  {questionStatusOptions.map((status) => (
                    <option key={status} value={status}>{questionStatusLabels[status]}</option>
                  ))}
                </select>
              </div>

              <div className={styles.toolbar} style={{ marginTop: 12, marginBottom: 0 }}>
                <p className={styles.questionCount} style={{ margin: 0 }}>
                  {isLoadingCatalog
                    ? 'Đang tải câu hỏi...'
                    : `${filteredQuestions.length}/${questions.length} câu hỏi`}
                </p>
                <button
                  className="btn secondary small"
                  type="button"
                  onClick={handleExportQuestions}
                  disabled={filteredQuestions.length === 0}
                >
                  <Download size={15} aria-hidden="true" />
                  Xuất CSV
                </button>
              </div>

              {isLoadingCatalog && questions.length === 0 ? (
                <PanelSkeleton rows={4} />
              ) : pagedQuestions.rows.length === 0 ? (
                <div className={styles.list}>
                  <EmptyState
                    icon={<Inbox size={26} aria-hidden="true" />}
                    title="Không có câu hỏi"
                    desc={questions.length === 0 ? 'Chưa có câu hỏi trong cơ sở dữ liệu.' : 'Không có câu hỏi khớp bộ lọc hiện tại.'}
                  />
                </div>
              ) : (
                <div className={styles.list}>
                  {pagedQuestions.rows.map((question) => (
                    <article key={question.id} className={styles.questionRow}>
                      <span>{question.code}</span>
                      <div>
                        <strong>{question.title}</strong>
                        <p>
                          {question.subject} · {question.difficulty}
                          {question.answer ? ` · Đáp án nháp ${question.answer}` : ''}
                        </p>
                        <div className={styles.questionRowActions}>
                          <select
                            className={styles.questionStatusSelect}
                            value={question.status}
                            onChange={(event) =>
                              handleChangeQuestionStatus(question, event.target.value as QuestionStatus)
                            }
                            disabled={!hasConfiguredSupabase}
                            aria-label={`Trạng thái câu hỏi ${question.code}`}
                          >
                            {questionStatusOptions.map((status) => (
                              <option key={status} value={status}>{questionStatusLabels[status]}</option>
                            ))}
                          </select>
                          <button
                            type="button"
                            className={`${styles.iconAction} ${styles.iconDanger}`}
                            title="Lưu trữ câu hỏi"
                            aria-label={`Lưu trữ câu hỏi ${question.code}`}
                            onClick={() => handleDeleteQuestion(question)}
                            disabled={!hasConfiguredSupabase}
                          >
                            <Trash2 size={15} aria-hidden="true" />
                          </button>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              )}
              <PaginationBar
                page={pagedQuestions.page}
                pageCount={pagedQuestions.pageCount}
                total={filteredQuestions.length}
                unit="câu hỏi"
                onPage={setQuestionsPage}
              />
            </section>

            <section id="subjects" className={styles.panel} role="tabpanel" aria-labelledby="admin-tab-bank">
              <div className={styles.panelHeader}>
                <div>
                  <h2>Môn học</h2>
                  <p>Danh sách lấy từ bảng subjects, thêm mới sẽ ghi vào Supabase.</p>
                </div>
              </div>
              <form className={styles.form} onSubmit={handleAddSubject}>
                <label>
                  Tên môn
                  <input name="subjectName" placeholder="Ví dụ: Vật lí" required />
                </label>
                <div className={styles.inlineFields}>
                  <label>
                    Mã môn
                    <input name="subjectCode" placeholder="PHYSICS" required />
                  </label>
                  <label>
                    Thời gian
                    <input name="duration" type="number" defaultValue={90} min={15} />
                  </label>
                </div>
                <button className="btn secondary" type="submit" disabled={!hasConfiguredSupabase}>
                  <Plus size={16} aria-hidden="true" />
                  Thêm môn
                </button>
              </form>
              <div className={styles.subjectTable}>
                {subjects.length === 0 ? (
                  <EmptyState
                    icon={<BookOpenCheck size={26} aria-hidden="true" />}
                    title={isLoadingCatalog ? 'Đang tải môn học...' : 'Chưa có môn học'}
                    desc={isLoadingCatalog ? 'Vui lòng chờ trong giây lát.' : 'Thêm môn học đầu tiên ở form phía trên.'}
                  />
                ) : null}
                {subjects.map((subject) => (
                  <div key={subject.code} className={styles.subjectRow}>
                    <div className={styles.subjectMain}>
                      <strong>{subject.name}</strong>
                      <span className={styles.subjectCode}>{subject.code}</span>
                    </div>
                    <span className={styles.subjectDuration}>{subject.duration} phút</span>
                    <em>{subject.status}</em>
                    <button
                      type="button"
                      className={styles.deleteButton}
                      title="Lưu trữ môn học"
                      aria-label={`Lưu trữ môn ${subject.code}`}
                      onClick={() => handleDeleteSubject(subject.code)}
                      disabled={!hasConfiguredSupabase}
                    >
                      <Trash2 size={16} aria-hidden="true" />
                    </button>
                  </div>
                ))}
              </div>
            </section>
          </div>
        ) : null}

        {activeTab === 'rooms' ? (
          <section id="rooms" className={styles.panel} role="tabpanel" aria-labelledby="admin-tab-rooms">
            <div className={styles.panelHeader}>
              <div>
                <h2>Phòng thi</h2>
                <p>Tạo phòng, gắn khung đề (blueprint) + môn, đặt thời lượng/khung giờ, mở hoặc đóng phòng.</p>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button
                  className="btn secondary small"
                  type="button"
                  onClick={handleExportRooms}
                  disabled={filteredRooms.length === 0}
                >
                  <Download size={15} aria-hidden="true" />
                  Xuất CSV
                </button>
                <button
                  className="btn outline small"
                  type="button"
                  onClick={() => void loadRooms()}
                  disabled={isLoadingRooms || !hasConfiguredSupabase}
                >
                  <RefreshCw size={15} aria-hidden="true" />
                  Tải lại
                </button>
              </div>
            </div>

            <div className={styles.resultStats} aria-label="Thống kê phòng thi">
              <div className={styles.resultStat}>
                <span>{roomStats.total}</span>
                <p>Tổng phòng</p>
              </div>
              <div className={styles.resultStat}>
                <span>{roomStats.published}</span>
                <p>Đang mở</p>
              </div>
              <div className={styles.resultStat}>
                <span>{roomStats.draft}</span>
                <p>Nháp</p>
              </div>
              <div className={styles.resultStat}>
                <span>{roomStats.total - roomStats.published - roomStats.draft}</span>
                <p>Đã đóng</p>
              </div>
            </div>

            <form id="room-form" className={`${styles.form} ${styles.keyForm}`} onSubmit={handleSubmitRoom}>
              <div className={styles.keyFormGrid}>
                <label>
                  Tên phòng
                  <input
                    value={roomForm.name}
                    onChange={(event) => setRoomForm((form) => ({ ...form, name: event.target.value }))}
                    placeholder="VD: Thi thử Toán lần 1"
                    required
                  />
                </label>
                <label>
                  Mã phòng
                  <input
                    value={roomForm.code}
                    onChange={(event) => setRoomForm((form) => ({ ...form, code: event.target.value }))}
                    placeholder="TOAN-2026-L1"
                    required
                  />
                </label>
                <label>
                  Môn
                  <select
                    value={roomForm.subjectCode}
                    onChange={(event) =>
                      setRoomForm((form) => ({ ...form, subjectCode: event.target.value, blueprintId: '' }))
                    }
                    required
                  >
                    <option value="">— Chọn môn —</option>
                    {subjects.map((subject) => (
                      <option key={subject.code} value={subject.code}>{subject.name}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Khung đề (blueprint)
                  <select
                    value={roomForm.blueprintId}
                    onChange={(event) => setRoomForm((form) => ({ ...form, blueprintId: event.target.value }))}
                    disabled={!roomForm.subjectCode}
                    required
                  >
                    <option value="">{roomForm.subjectCode ? '— Chọn blueprint —' : 'Chọn môn trước'}</option>
                    {blueprintsForSubject.map((blueprint) => (
                      <option key={blueprint.id} value={blueprint.id}>{blueprint.name}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Thời lượng (phút)
                  <input
                    value={roomForm.durationMinutes}
                    onChange={(event) => setRoomForm((form) => ({ ...form, durationMinutes: event.target.value }))}
                    type="number"
                    min={1}
                    required
                  />
                </label>
                <label>
                  Số lượt mặc định
                  <input
                    value={roomForm.totalAttempts}
                    onChange={(event) => setRoomForm((form) => ({ ...form, totalAttempts: event.target.value }))}
                    type="number"
                    min={1}
                    required
                  />
                </label>
                <label>
                  Mở lúc (tuỳ chọn)
                  <input
                    value={roomForm.startsAt}
                    onChange={(event) => setRoomForm((form) => ({ ...form, startsAt: event.target.value }))}
                    type="datetime-local"
                  />
                </label>
                <label>
                  Đóng lúc (tuỳ chọn)
                  <input
                    value={roomForm.endsAt}
                    onChange={(event) => setRoomForm((form) => ({ ...form, endsAt: event.target.value }))}
                    type="datetime-local"
                  />
                </label>
                <label>
                  Trạng thái
                  <select
                    value={roomForm.status}
                    onChange={(event) =>
                      setRoomForm((form) => ({ ...form, status: event.target.value as ExamRoomStatus }))
                    }
                  >
                    <option value="draft">Nháp</option>
                    <option value="published">Đang mở</option>
                    <option value="archived">Đã đóng</option>
                  </select>
                </label>
              </div>

              <div className={styles.keyFormActions}>
                <button className="btn" type="submit" disabled={isSavingRoom || !hasConfiguredSupabase}>
                  <Plus size={16} aria-hidden="true" />
                  {isSavingRoom ? 'Đang lưu...' : editingRoomId ? 'Cập nhật phòng' : 'Tạo phòng'}
                </button>
                {editingRoomId ? (
                  <button className="btn outline small" type="button" onClick={resetRoomForm}>
                    Huỷ sửa
                  </button>
                ) : null}
                <span>Khung đề phải cùng môn với phòng. Phòng phải “Đang mở” thì key mới vào thi được.</span>
              </div>

              {roomsFeedback ? <p className={styles.feedback} role="status" aria-live="polite">{roomsFeedback}</p> : null}
            </form>

            <div className={styles.toolbar}>
              <div className={styles.toolbarGroup}>
                <label className={styles.search} style={{ width: 'min(280px, 100%)' }}>
                  <Search size={16} aria-hidden="true" />
                  <input
                    value={roomSearch}
                    onChange={(event) => {
                      setRoomSearch(event.target.value);
                      setRoomsPage(1);
                    }}
                    placeholder="Tìm mã / tên phòng..."
                    aria-label="Tìm phòng thi"
                  />
                </label>
                <label>
                  Trạng thái
                  <select value={roomStatusFilter} onChange={(event) => {
                    setRoomStatusFilter(event.target.value);
                    setRoomsPage(1);
                  }} aria-label="Lọc phòng theo trạng thái">
                    <option value="">Tất cả</option>
                    <option value="published">Đang mở</option>
                    <option value="draft">Nháp</option>
                    <option value="archived">Đã đóng</option>
                  </select>
                </label>
              </div>
            </div>

            {isLoadingRooms && rooms.length === 0 ? (
              <PanelSkeleton rows={4} />
            ) : pagedRooms.rows.length === 0 ? (
              <EmptyState
                icon={<DoorOpen size={28} aria-hidden="true" />}
                title="Không có phòng thi"
                desc={rooms.length === 0 ? 'Tạo phòng đầu tiên ở form phía trên.' : 'Không có phòng nào khớp tìm kiếm hiện tại.'}
              />
            ) : (
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <caption className={styles.srOnly}>Danh sách phòng thi</caption>
                  <thead>
                    <tr>
                      <th scope="col">Phòng</th>
                      <th scope="col">Môn</th>
                      <th scope="col">Thời lượng</th>
                      <th scope="col">Câu / Đề</th>
                      <th scope="col">Khung giờ</th>
                      <th scope="col">Trạng thái</th>
                      <th scope="col">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagedRooms.rows.map((room) => (
                      <tr key={room.id}>
                        <td>
                          <strong>{room.code}</strong>
                          <div className={styles.cellSub}>{room.name}</div>
                        </td>
                        <td>{room.subjectName}</td>
                        <td>{room.durationMinutes} phút</td>
                        <td>{room.questionCount} câu · {room.paperCount} đề</td>
                        <td>
                          {room.startsAt || room.endsAt
                            ? `${formatDateTime(room.startsAt)} → ${formatDateTime(room.endsAt)}`
                            : 'Không giới hạn'}
                        </td>
                        <td><span className={styles.keyStatus}>{roomStatusLabels[room.status]}</span></td>
                        <td>
                          <div className={styles.rowActions}>
                            {room.status !== 'published' ? (
                              <button
                                type="button"
                                className={styles.iconAction}
                                title="Mở phòng"
                                aria-label={`Mở phòng ${room.code}`}
                                onClick={() => handleRoomStatus(room, 'published')}
                              >
                                <DoorOpen size={15} aria-hidden="true" />
                              </button>
                            ) : null}
                            <button
                              type="button"
                              className={styles.iconAction}
                              title="Sửa phòng"
                              aria-label={`Sửa phòng ${room.code}`}
                              onClick={() => handleEditRoom(room)}
                            >
                              <FilePenLine size={15} aria-hidden="true" />
                            </button>
                            {room.status !== 'archived' ? (
                              <button
                                type="button"
                                className={styles.iconAction}
                                title="Đóng phòng"
                                aria-label={`Đóng phòng ${room.code}`}
                                onClick={() => handleRoomStatus(room, 'archived')}
                              >
                                <Archive size={15} aria-hidden="true" />
                              </button>
                            ) : null}
                            <button
                              type="button"
                              className={`${styles.iconAction} ${styles.iconDanger}`}
                              title="Lưu trữ phòng"
                              aria-label={`Lưu trữ phòng ${room.code}`}
                              onClick={() => handleDeleteRoom(room)}
                            >
                              <Trash2 size={15} aria-hidden="true" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <PaginationBar
              page={pagedRooms.page}
              pageCount={pagedRooms.pageCount}
              total={filteredRooms.length}
              unit="phòng thi"
              onPage={setRoomsPage}
            />
          </section>
        ) : null}

        {activeTab === 'keys' ? (
          <section id="keys" className={styles.panel} role="tabpanel" aria-labelledby="admin-tab-keys">
            <div className={styles.panelHeader}>
              <div>
                <h2>Quản lý key</h2>
                <p>Tạo key public hoặc cá nhân, đặt quota và theo dõi lượt sử dụng.</p>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button
                  className="btn secondary small"
                  type="button"
                  onClick={handleExportKeys}
                  disabled={filteredKeys.length === 0}
                >
                  <Download size={15} aria-hidden="true" />
                  Xuất CSV
                </button>
                <button
                  className="btn outline small"
                  type="button"
                  onClick={() => void loadKeyManagement()}
                  disabled={isLoadingKeys || !hasConfiguredSupabase}
                >
                  <RefreshCw size={15} aria-hidden="true" />
                  Tải lại
                </button>
              </div>
            </div>

            <div className={styles.resultStats} aria-label="Thống kê key">
              <div className={styles.resultStat}>
                <span>{keyStats.total}</span>
                <p>Tổng key</p>
              </div>
              <div className={styles.resultStat}>
                <span>{keyStats.active}</span>
                <p>Còn hiệu lực</p>
              </div>
              <div className={styles.resultStat}>
                <span>{keyStats.expired}</span>
                <p>Hết lượt / hạn</p>
              </div>
              <div className={styles.resultStat}>
                <span>{filteredKeys.length}</span>
                <p>Khớp bộ lọc</p>
              </div>
            </div>

            <form id="key-form" className={`${styles.form} ${styles.keyForm}`} onSubmit={handleCreateKeys}>
              <div className={styles.keyFormGrid}>
                <label>
                  Loại key
                  <select
                    value={keyMode}
                    onChange={(event) => {
                      const mode = event.target.value as 'public' | 'private';
                      setKeyMode(mode);
                      setKeyTotalAttempts(mode === 'public' ? '100' : '3');
                    }}
                  >
                    <option value="public">Public — nhiều tài khoản</option>
                    <option value="private">Cá nhân — một tài khoản</option>
                  </select>
                </label>
                <label>
                  Giới hạn lượt làm
                  <input
                    value={keyTotalAttempts}
                    onChange={(event) => setKeyTotalAttempts(event.target.value)}
                    type="number"
                    min={1}
                    max={100000}
                    inputMode="numeric"
                    required
                  />
                </label>
                <label>
                  Số lượng key
                  <input
                    value={keyQuantity}
                    onChange={(event) => setKeyQuantity(event.target.value)}
                    type="number"
                    min={1}
                    max={500}
                    inputMode="numeric"
                    required
                  />
                </label>
                <label>
                  Ngày hết hạn
                  <input
                    value={keyExpiry}
                    onChange={(event) => setKeyExpiry(event.target.value)}
                    type="date"
                    min={hanoiTodayInputValue()}
                  />
                </label>
                <label>
                  Ghi chú batch
                  <input
                    value={keyNote}
                    onChange={(event) => setKeyNote(event.target.value)}
                    placeholder="Ví dụ: Đợt bán tháng 6"
                  />
                </label>
              </div>

              <div className={styles.keyFormActions}>
                <button
                  className="btn"
                  type="submit"
                  disabled={
                    isCreatingKeys ||
                    isLoadingKeys ||
                    !hasConfiguredSupabase
                  }
                >
                  <Plus size={16} aria-hidden="true" />
                  {isCreatingKeys ? 'Đang tạo...' : `Tạo ${Number.parseInt(keyQuantity, 10) || 0} key`}
                </button>
                <span>
                  {keyTotalAttempts || 0} lượt/key ·{' '}
                  {keyMode === 'public'
                    ? 'Dùng chung nhiều tài khoản, mọi phòng thi'
                    : 'Một tài khoản, mọi phòng thi'} ·{' '}
                  Hết hạn {formatDate(keyExpiry ? getEndOfDayIso(keyExpiry) : null)}
                </span>
              </div>

              {keyFeedback ? <p className={styles.feedback} role="status" aria-live="polite">{keyFeedback}</p> : null}
            </form>

            <div className={styles.toolbar}>
              <div className={styles.toolbarGroup}>
                <label className={styles.search} style={{ width: 'min(280px, 100%)' }}>
                  <Search size={16} aria-hidden="true" />
                  <input
                    value={keySearch}
                    onChange={(event) => {
                      setKeySearch(event.target.value);
                      setKeysPage(1);
                    }}
                    placeholder="Tìm mã key / học viên..."
                    aria-label="Tìm key"
                  />
                </label>
                <label>
                  Trạng thái
                  <select value={keyStatusFilter} onChange={(event) => {
                    setKeyStatusFilter(event.target.value);
                    setKeysPage(1);
                  }} aria-label="Lọc key theo trạng thái">
                    <option value="">Tất cả</option>
                    <option value="unused">Chưa dùng</option>
                    <option value="active">Đang dùng</option>
                    <option value="exhausted">Hết lượt</option>
                    <option value="expired">Hết hạn</option>
                    <option value="revoked">Đã thu hồi</option>
                  </select>
                </label>
              </div>
            </div>

            {isLoadingKeys && keys.length === 0 ? (
              <PanelSkeleton rows={5} />
            ) : pagedKeys.rows.length === 0 ? (
              <EmptyState
                icon={<KeyRound size={28} aria-hidden="true" />}
                title="Không có key"
                desc={keys.length === 0 ? 'Tạo batch key đầu tiên ở form phía trên.' : 'Không có key nào khớp tìm kiếm hiện tại.'}
              />
            ) : (
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <caption className={styles.srOnly}>Danh sách key thi</caption>
                  <thead>
                    <tr>
                      <th scope="col">Key</th>
                      <th scope="col">Loại</th>
                      <th scope="col">Hiệu lực</th>
                      <th scope="col">Học viên</th>
                      <th scope="col">Lượt</th>
                      <th scope="col">Hết hạn</th>
                      <th scope="col">Trạng thái</th>
                      <th scope="col">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagedKeys.rows.map((key) => (
                      <tr key={key.id}>
                        <td><strong>{key.code}</strong></td>
                        <td><span className={styles.keyStatus}>{key.isPublic ? 'Public' : 'Cá nhân'}</span></td>
                        <td>{key.room}</td>
                        <td>{key.student}</td>
                        <td>{key.attempts}</td>
                        <td>{formatDate(key.expiresAt)}</td>
                        <td><span className={styles.keyStatus}>{key.status}</span></td>
                        <td>
                          <div className={styles.rowActions}>
                            <button
                              type="button"
                              className={styles.iconAction}
                              title="Thu hồi key"
                              aria-label={`Thu hồi key ${key.code}`}
                              onClick={() => handleRevokeKey(key)}
                              disabled={key.rawStatus !== 'unused' && key.rawStatus !== 'active'}
                            >
                              <Ban size={15} aria-hidden="true" />
                            </button>
                            <button
                              type="button"
                              className={styles.iconAction}
                              title="Gia hạn hết hạn"
                              aria-label={`Gia hạn key ${key.code}`}
                              onClick={() => handleExtendKey(key)}
                              disabled={key.rawStatus === 'revoked'}
                            >
                              <CalendarClock size={15} aria-hidden="true" />
                            </button>
                            <button
                              type="button"
                              className={`${styles.iconAction} ${styles.iconDanger}`}
                              title="Thu hồi và lưu trữ key"
                              aria-label={`Lưu trữ key ${key.code}`}
                              onClick={() => handleDeleteKey(key)}
                            >
                              <Trash2 size={15} aria-hidden="true" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <PaginationBar
              page={pagedKeys.page}
              pageCount={pagedKeys.pageCount}
              total={filteredKeys.length}
              unit="key"
              onPage={setKeysPage}
            />
          </section>
        ) : null}

        {activeTab === 'grading' ? (
          <>
          <section id="grading" className={styles.panel} role="tabpanel" aria-labelledby="admin-tab-grading">
              <div className={styles.panelHeader}>
                <div>
                  <h2>Chấm tự luận</h2>
                  <p>Câu tự luận đã nộp đang chờ chấm tay. Chấm xong tổng điểm phiên tự cập nhật.</p>
                </div>
                <button
                  className="btn outline small"
                  type="button"
                  onClick={() => void loadPendingEssays()}
                  disabled={isLoadingEssays || !hasConfiguredSupabase}
                >
                  <RefreshCw size={15} aria-hidden="true" />
                  Tải lại
                </button>
              </div>

              {essaysFeedback ? <p className={styles.feedback} role="status" aria-live="polite">{essaysFeedback}</p> : null}

              {isLoadingEssays && pendingEssays.length === 0 ? (
                <PanelSkeleton rows={3} />
              ) : pagedEssays.rows.length === 0 ? (
                <div className={styles.list}>
                  <EmptyState
                    icon={<ClipboardCheck size={28} aria-hidden="true" />}
                    title="Không có bài chờ chấm"
                    desc="Khi thí sinh nộp câu tự luận, bài sẽ hiện ở đây."
                  />
                </div>
              ) : (
                <div className={styles.essayList}>
                  {pagedEssays.rows.map((essay) => (
                    <article key={essay.answerId} className={styles.essayCard}>
                      <div className={styles.essayMeta}>
                        <strong>{essay.studentName}</strong>
                        <span>{essay.subjectName} · {essay.roomName} · Câu {essay.displayNo}</span>
                      </div>
                      <div className={styles.essayBlock}>
                        <span className={styles.essayLabel}>Đề bài</span>
                        <p>{essay.questionContent}</p>
                      </div>
                      <div className={styles.essayBlock}>
                        <span className={styles.essayLabel}>Bài làm</span>
                        <p>{essay.studentAnswer || '(Thí sinh không trả lời)'}</p>
                      </div>
                      <div className={styles.essayGrade}>
                        <label>
                          Điểm (tối đa {essay.maxPoints})
                          <input
                            type="number"
                            min={0}
                            max={essay.maxPoints}
                            step="0.25"
                            value={essayScores[essay.answerId] ?? ''}
                            onChange={(event) =>
                              setEssayScores((current) => ({ ...current, [essay.answerId]: event.target.value }))
                            }
                            placeholder="0"
                            aria-label={`Điểm bài của ${essay.studentName}`}
                          />
                        </label>
                        <button
                          className="btn"
                          type="button"
                          onClick={() => handleGradeEssay(essay)}
                          disabled={gradingId === essay.answerId || !hasConfiguredSupabase}
                        >
                          {gradingId === essay.answerId ? 'Đang lưu...' : 'Lưu điểm'}
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              )}
              <PaginationBar
                page={pagedEssays.page}
                pageCount={pagedEssays.pageCount}
                total={pendingEssays.length}
                unit="bài tự luận"
                onPage={setEssaysPage}
              />
            </section>

            <section id="students" className={styles.panel} role="tabpanel" aria-labelledby="admin-tab-grading">
              <div className={styles.panelHeader}>
                <div>
                  <h2>Quản lý học viên</h2>
                  <p>Tìm kiếm học viên, trường và key được gán.</p>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  <label className={styles.search}>
                    <Search size={16} aria-hidden="true" />
                    <input
                      value={searchTerm}
                      onChange={(event) => {
                        setSearchTerm(event.target.value);
                        setStudentsPage(1);
                      }}
                      placeholder="Tìm học viên..."
                      aria-label="Tìm học viên"
                    />
                  </label>
                  <button
                    className="btn secondary small"
                    type="button"
                    onClick={handleExportStudents}
                    disabled={filteredStudents.length === 0}
                  >
                    <Download size={15} aria-hidden="true" />
                    Xuất CSV
                  </button>
                </div>
              </div>
              {isLoadingCatalog && students.length === 0 ? (
                <PanelSkeleton rows={4} />
              ) : pagedStudents.rows.length === 0 ? (
                <EmptyState
                  icon={<Users size={28} aria-hidden="true" />}
                  title="Không có học viên"
                  desc={students.length === 0 ? 'Chưa có học viên trong cơ sở dữ liệu.' : 'Không có học viên khớp tìm kiếm.'}
                />
              ) : (
                <div className={styles.tableWrap}>
                  <table className={styles.table}>
                    <caption className={styles.srOnly}>Danh sách học viên</caption>
                    <thead>
                      <tr>
                        <th scope="col">SBD</th>
                        <th scope="col">Họ tên</th>
                        <th scope="col">Trường</th>
                        <th scope="col">Key hiện tại</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pagedStudents.rows.map((student) => (
                        <tr key={student.code}>
                          <td><strong>{student.code}</strong></td>
                          <td>{student.name}</td>
                          <td>{student.school}</td>
                          <td>{student.key}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <PaginationBar
                page={pagedStudents.page}
                pageCount={pagedStudents.pageCount}
                total={filteredStudents.length}
                unit="học viên"
                onPage={setStudentsPage}
              />
            </section>
          </>
        ) : null}
      </main>

      {dialog ? (
        <AdminDialog key={dialog.id} dialog={dialog} busy={dialogBusy} onClose={closeDialog} onSubmit={submitDialog} />
      ) : null}
    </div>
  );
}
