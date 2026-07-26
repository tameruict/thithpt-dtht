'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Archive,
  Ban,
  BarChart3,
  BookOpenCheck,
  CalendarClock,
  DoorOpen,
  Download,
  FilePenLine,
  GraduationCap,
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
    return 'Tài khoản hiện tại cần role admin hoặc teacher trong Supabase để tạo key.';
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
    return 'Tài khoản hiện tại cần role admin hoặc teacher trong Supabase để xem và chỉnh dữ liệu quản trị.';
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
    return 'Tài khoản cần role admin hoặc teacher để quản lý phòng thi.';
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
      csvCell(formatDateTime(row.startedAt)),
      csvCell(formatDateTime(row.submittedAt)),
    ].join(','),
  );

  // BOM để Excel (vi-VN) đọc đúng UTF-8 tiếng Việt.
  return `﻿${[header.map(csvCell).join(','), ...lines].join('\r\n')}`;
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

export default function AdminPage() {
  const router = useRouter();
  const hasConfiguredSupabase = hasSupabaseEnv();
  // null = đang kiểm tra, false = không có quyền, true = có quyền
  const [isStaff, setIsStaff] = useState<boolean | null>(null);
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

  // Guard: kiểm tra role admin/teacher, redirect nếu không có quyền
  useEffect(() => {
    if (!hasConfiguredSupabase) {
      return;
    }

    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) {
        router.replace('/');
        return;
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', data.user.id)
        .maybeSingle();

      if (profile && ['admin', 'teacher'].includes(profile.role as string)) {
        setIsStaff(true);
      } else {
        router.replace('/subjects');
      }
    }).catch(() => router.replace('/subjects'));
  }, [hasConfiguredSupabase, router]);

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
      setRoomsFeedback(getAdminDataErrorMessage(error));
    } finally {
      setIsLoadingRooms(false);
    }
  }, [hasConfiguredSupabase]);

  useEffect(() => {
    if (!hasConfiguredSupabase) return;

    const timeoutId = window.setTimeout(() => {
      void loadAdminCatalog();
      void loadKeyManagement();
      void loadExamResults();
      void loadRooms();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [hasConfiguredSupabase, loadAdminCatalog, loadKeyManagement, loadExamResults, loadRooms]);

  const filteredStudents = useMemo(() => {
    const nextSearch = searchTerm.trim().toLowerCase();
    if (!nextSearch) return students;

    return students.filter((student) =>
      [student.code, student.name, student.school, student.key].some((value) =>
        value.toLowerCase().includes(nextSearch),
      ),
    );
  }, [searchTerm, students]);

  const filteredQuestions = useMemo(() => {
    const search = questionSearch.trim().toLowerCase();
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
  }, [questions, questionSearch, questionSubject, questionDifficulty, questionStatusFilter]);

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

  const handleExportResults = () => {
    if (filteredResults.length === 0) return;

    const csv = buildResultsCsv(filteredResults);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `ket-qua-thi_${hanoiTodayInputValue()}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
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
    document.getElementById('rooms')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
      } else {
        const { error } = await supabase.from('exam_rooms').insert(payload);
        if (error) throw error;
        setRoomsFeedback(`Đã tạo phòng ${code}.`);
      }
      resetRoomForm();
      await loadRooms();
    } catch (error) {
      setRoomsFeedback(getRoomErrorMessage(error));
    } finally {
      setIsSavingRoom(false);
    }
  };

  const handleRoomStatus = async (room: ExamRoom, status: ExamRoomStatus) => {
    if (!hasConfiguredSupabase) return;
    if (status === 'archived' && !window.confirm(`Đóng phòng ${room.code}? Thí sinh sẽ không vào thi được nữa.`)) {
      return;
    }

    try {
      const patch: { status: ExamRoomStatus; published_at?: string | null } = { status };
      if (status === 'published') patch.published_at = new Date().toISOString();
      const { error } = await createClient().from('exam_rooms').update(patch).eq('id', room.id);
      if (error) throw error;
      await loadRooms();
    } catch (error) {
      setRoomsFeedback(getRoomErrorMessage(error));
    }
  };

  const handleDeleteRoom = async (room: ExamRoom) => {
    if (!hasConfiguredSupabase) return;
    if (!window.confirm(`Xoá phòng ${room.code}? Các đề/câu hỏi gắn trong phòng cũng bị xoá. Không thể hoàn tác.`)) {
      return;
    }

    try {
      const { error } = await createClient().from('exam_rooms').delete().eq('id', room.id);
      if (error) {
        if (error.code === '23503' || error.message.includes('foreign key')) {
          setRoomsFeedback(`Phòng ${room.code} đang có phiên thi liên quan nên không xoá được. Hãy "Đóng phòng" thay vì xoá.`);
          return;
        }
        throw error;
      }
      if (editingRoomId === room.id) resetRoomForm();
      await loadRooms();
    } catch (error) {
      setRoomsFeedback(getRoomErrorMessage(error));
    }
  };

  const handleDeleteSubject = async (code: string) => {
    if (!hasConfiguredSupabase) {
      setCatalogFeedback('Chưa cấu hình Supabase nên không thể xóa môn học.');
      return;
    }

    if (!window.confirm(`Bạn có chắc chắn muốn xóa môn học mã ${code}? Các dữ liệu liên quan có thể bị ảnh hưởng.`)) {
      return;
    }

    try {
      const supabase = createClient();
      const { error } = await supabase.from('subjects').delete().eq('code', code);

      if (error) {
        if (error.code === '23503' || error.message.includes('foreign key constraint')) {
          if (window.confirm(`Môn học ${code} đang được sử dụng (đã có câu hỏi/phòng thi) nên không thể xóa hoàn toàn.\n\nBạn có muốn chuyển môn học này sang trạng thái "Nháp" để ẩn đi không?`)) {
            const { error: updateError } = await supabase.from('subjects').update({ is_active: false }).eq('code', code);
            if (updateError) throw updateError;
            await loadAdminCatalog();
            return;
          } else {
            return;
          }
        }
        throw error;
      }

      await loadAdminCatalog();
    } catch (error) {
      setCatalogFeedback(getAdminDataErrorMessage(error));
    }
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
      await loadAdminCatalog();
    } catch (error) {
      setCatalogFeedback(getAdminDataErrorMessage(error));
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
      setCatalogFeedback(getAdminDataErrorMessage(error));
      await loadAdminCatalog();
    }
  };

  const handleDeleteQuestion = async (question: DraftQuestion) => {
    if (!hasConfiguredSupabase) return;
    if (
      !window.confirm(
        `Xoá câu hỏi ${question.code}? Nếu câu đã dùng trong đề/phiên thi sẽ không xoá được.`,
      )
    ) {
      return;
    }

    try {
      const supabase = createClient();
      const { error } = await supabase.from('questions').delete().eq('id', question.id);
      if (error) {
        if (error.code === '23503' || error.message.includes('foreign key')) {
          if (
            window.confirm(
              `Câu hỏi ${question.code} đang được dùng nên không xoá được.\n\nChuyển sang "Lưu trữ" để ẩn khỏi ngân hàng?`,
            )
          ) {
            const { error: archiveError } = await supabase
              .from('questions')
              .update({ status: 'archived' })
              .eq('id', question.id);
            if (archiveError) throw archiveError;
            await loadAdminCatalog();
          }
          return;
        }
        throw error;
      }
      await loadAdminCatalog();
    } catch (error) {
      setCatalogFeedback(getAdminDataErrorMessage(error));
    }
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
        p_exam_room_id: null,
        p_quantity: quantity,
        p_expires_at: expiresAt,
        p_note: keyNote.trim() || null,
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
      setKeyFeedback(`Đã tạo ${createdKeys.length || quantity} key trong cơ sở dữ liệu.`);
      await loadKeyManagement();
    } catch (error) {
      setKeyFeedback(getErrorMessage(error));
    } finally {
      setIsCreatingKeys(false);
    }
  };

  const handleRevokeKey = async (key: ExamKey) => {
    if (!hasConfiguredSupabase) return;
    if (!window.confirm(`Thu hồi key ${key.code}? Thí sinh sẽ không dùng key này để vào thi được nữa.`)) {
      return;
    }

    try {
      const { error } = await createClient()
        .from('exam_keys')
        .update({ status: 'revoked' })
        .eq('id', key.id);
      if (error) throw error;
      setKeyFeedback(`Đã thu hồi key ${key.code}.`);
      await loadKeyManagement();
    } catch (error) {
      setKeyFeedback(getAdminDataErrorMessage(error));
    }
  };

  const handleExtendKey = async (key: ExamKey) => {
    if (!hasConfiguredSupabase) return;

    const suggestion = key.expiresAt
      ? hanoiTodayInputValue(new Date(key.expiresAt))
      : getDefaultExpiryDate();
    const input = window.prompt(
      `Gia hạn key ${key.code} — nhập ngày hết hạn mới (YYYY-MM-DD):`,
      suggestion,
    );
    if (!input) return;

    const trimmed = input.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      setKeyFeedback('Ngày không hợp lệ. Định dạng đúng: YYYY-MM-DD.');
      return;
    }

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
      setKeyFeedback(`Đã gia hạn key ${key.code} đến ${formatDate(expiresAt)}.`);
      await loadKeyManagement();
    } catch (error) {
      setKeyFeedback(getAdminDataErrorMessage(error));
    }
  };

  const handleDeleteKey = async (key: ExamKey) => {
    if (!hasConfiguredSupabase) return;
    if (!window.confirm(`Xoá vĩnh viễn key ${key.code}? Không thể hoàn tác.`)) return;

    try {
      const { error } = await createClient().from('exam_keys').delete().eq('id', key.id);
      if (error) {
        if (error.code === '23503' || error.message.includes('foreign key')) {
          setKeyFeedback(`Key ${key.code} đã có phiên thi nên không xoá được. Hãy thu hồi thay vì xoá.`);
          return;
        }
        throw error;
      }
      setKeyFeedback(`Đã xoá key ${key.code}.`);
      await loadKeyManagement();
    } catch (error) {
      setKeyFeedback(getAdminDataErrorMessage(error));
    }
  };

  const scrollToKeys = () => {
    document.getElementById('keys')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const activeKeyCount = keys.filter((key) => activeKeyStatuses.has(key.status)).length;

  // Chờ guard kiểm tra quyền trước khi render trang
  if (isStaff === null) {
    return (
      <div className={styles.screen} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p>Đang kiểm tra quyền truy cập...</p>
      </div>
    );
  }

  return (
    <div className={styles.screen}>
      <aside className={styles.sidebar}>
        <div className={styles.brand}>
          <span className={styles.brandIcon}><ShieldCheck size={20} /></span>
          <span>Admin THPT</span>
        </div>
        <nav className={styles.nav}>
          <Link href="/admin/authoring" transitionTypes={['nav-forward']}><FilePenLine size={18} /> Soạn đề</Link>
          <a href="#results"><BarChart3 size={18} /> Kết quả thi</a>
          <a href="#rooms"><DoorOpen size={18} /> Phòng thi</a>
          <a href="#subjects"><BookOpenCheck size={18} /> Môn học</a>
          <a href="#keys"><KeyRound size={18} /> Quản lý key</a>
          <a href="#students"><Users size={18} /> Học viên</a>
        </nav>
        <button className={styles.backButton} type="button" onClick={() => router.push('/subjects', { transitionTypes: ['nav-back'] })}>
          Về giao diện thi
        </button>
      </aside>

      <main className={styles.main}>
        <header className={styles.header}>
          <div>
            <h1>Quản trị hệ thống thi</h1>
            <p>Soạn đề, mở môn học, cấp key và theo dõi học viên trong một màn hình.</p>
          </div>
          <button className="btn" type="button" onClick={scrollToKeys}>
            <Plus size={16} />
            Tạo key
          </button>
        </header>

        <section className={styles.metrics} aria-label="Tổng quan">
          <div className={styles.metric}>
            <BookOpenCheck size={20} />
            <span>{subjects.length}</span>
            <p>Môn học</p>
          </div>
          <div className={styles.metric}>
            <FilePenLine size={20} />
            <span>{questions.length}</span>
            <p>Câu hỏi</p>
          </div>
          <div className={styles.metric}>
            <KeyRound size={20} />
            <span>{activeKeyCount}</span>
            <p>Key còn hiệu lực</p>
          </div>
          <div className={styles.metric}>
            <GraduationCap size={20} />
            <span>{students.length}</span>
            <p>Học viên</p>
          </div>
        </section>

        <section id="results" className={styles.panel}>
          <div className={styles.panelHeader}>
            <div>
              <h2>Kết quả thi</h2>
              <p>Điểm và lượt thi của thí sinh theo phòng/môn. Hiển thị tối đa 1.000 phiên gần nhất.</p>
            </div>
            <button
              className="btn outline small"
              type="button"
              onClick={loadExamResults}
              disabled={isLoadingResults || !hasConfiguredSupabase}
            >
              <RefreshCw size={15} />
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
                  }}
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
                  onChange={(event) => setResultFilterRoom(event.target.value)}
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
                  onChange={(event) => setResultFilterStatus(event.target.value)}
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
              <Download size={16} />
              Xuất CSV
            </button>
          </div>

          {resultsFeedback ? <p className={styles.feedback}>{resultsFeedback}</p> : null}

          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Thí sinh</th>
                  <th>Trường</th>
                  <th>Môn</th>
                  <th>Phòng</th>
                  <th>Lượt</th>
                  <th>Điểm</th>
                  <th>Trạng thái</th>
                  <th>Nộp bài</th>
                </tr>
              </thead>
              <tbody>
                {filteredResults.length === 0 ? (
                  <tr>
                    <td className={styles.emptyCell} colSpan={8}>
                      {isLoadingResults ? 'Đang tải kết quả...' : 'Chưa có phiên thi nào khớp bộ lọc.'}
                    </td>
                  </tr>
                ) : (
                  filteredResults.map((result) => (
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
                      <td>{formatDateTime(result.submittedAt)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        <div className={styles.workGrid}>
          <section id="compose" className={styles.panel}>
            <div className={styles.panelHeader}>
              <div>
                <h2>Ngân hàng câu hỏi</h2>
                <p>Câu hỏi hiển thị từ bảng questions trong Supabase.</p>
              </div>
              <span className={styles.status}>{isLoadingCatalog ? 'Đang tải' : 'Dữ liệu DB'}</span>
            </div>
            <div className={styles.form}>
              <p>
                Workspace LaTeX mới hỗ trợ preview trực tiếp, autosave, xuất bản
                atomic và ảnh Cloudflare R2 trong câu hỏi hoặc từng lựa chọn.
              </p>
              <button
                className="btn"
                type="button"
                onClick={() => router.push('/admin/authoring', { transitionTypes: ['nav-forward'] })}
                disabled={!hasConfiguredSupabase || subjects.length === 0}
              >
                <FilePenLine size={16} />
                Mở trang soạn đề
              </button>
            </div>

            {catalogFeedback ? <p className={styles.feedback}>{catalogFeedback}</p> : null}

            <div className={styles.questionFilters}>
              <label className={styles.search}>
                <Search size={16} />
                <input
                  value={questionSearch}
                  onChange={(event) => setQuestionSearch(event.target.value)}
                  placeholder="Tìm mã hoặc nội dung..."
                />
              </label>
              <select value={questionSubject} onChange={(event) => setQuestionSubject(event.target.value)}>
                <option value="">Tất cả môn</option>
                {subjects.map((subject) => (
                  <option key={subject.code} value={subject.code}>{subject.name}</option>
                ))}
              </select>
              <select value={questionDifficulty} onChange={(event) => setQuestionDifficulty(event.target.value)}>
                <option value="">Mọi độ khó</option>
                {questionDifficultyOptions.map((level) => (
                  <option key={level} value={String(level)}>{difficultyLabel(level)}</option>
                ))}
              </select>
              <select value={questionStatusFilter} onChange={(event) => setQuestionStatusFilter(event.target.value)}>
                <option value="">Mọi trạng thái</option>
                {questionStatusOptions.map((status) => (
                  <option key={status} value={status}>{questionStatusLabels[status]}</option>
                ))}
              </select>
            </div>

            <p className={styles.questionCount}>
              {isLoadingCatalog
                ? 'Đang tải câu hỏi...'
                : `${filteredQuestions.length}/${questions.length} câu hỏi`}
            </p>

            <div className={styles.list}>
              {filteredQuestions.length === 0 ? (
                <div className={styles.emptyCell}>
                  {isLoadingCatalog
                    ? 'Đang tải câu hỏi...'
                    : questions.length === 0
                      ? 'Chưa có câu hỏi trong cơ sở dữ liệu.'
                      : 'Không có câu hỏi khớp bộ lọc.'}
                </div>
              ) : (
                filteredQuestions.map((question) => (
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
                        >
                          {questionStatusOptions.map((status) => (
                            <option key={status} value={status}>{questionStatusLabels[status]}</option>
                          ))}
                        </select>
                        <button
                          type="button"
                          className={`${styles.iconAction} ${styles.iconDanger}`}
                          title="Xoá câu hỏi"
                          onClick={() => handleDeleteQuestion(question)}
                          disabled={!hasConfiguredSupabase}
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>
                  </article>
                ))
              )}
            </div>
          </section>

          <section id="subjects" className={styles.panel}>
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
                <Plus size={16} />
                Thêm môn
              </button>
            </form>
            <div className={styles.subjectTable}>
              {subjects.length === 0 ? (
                <div className={styles.subjectEmpty}>
                  <strong>{isLoadingCatalog ? 'Đang tải môn học...' : 'Chưa có môn học trong DB'}</strong>
                </div>
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
                    title="Xóa môn học"
                    onClick={() => handleDeleteSubject(subject.code)}
                    disabled={!hasConfiguredSupabase}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
          </section>
        </div>

        <section id="rooms" className={styles.panel}>
          <div className={styles.panelHeader}>
            <div>
              <h2>Phòng thi</h2>
              <p>Tạo phòng, gắn khung đề (blueprint) + môn, đặt thời lượng/khung giờ, mở hoặc đóng phòng.</p>
            </div>
            <button
              className="btn outline small"
              type="button"
              onClick={loadRooms}
              disabled={isLoadingRooms || !hasConfiguredSupabase}
            >
              <RefreshCw size={15} />
              Tải lại
            </button>
          </div>

          <form className={`${styles.form} ${styles.keyForm}`} onSubmit={handleSubmitRoom}>
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
                <Plus size={16} />
                {isSavingRoom ? 'Đang lưu...' : editingRoomId ? 'Cập nhật phòng' : 'Tạo phòng'}
              </button>
              {editingRoomId ? (
                <button className="btn outline small" type="button" onClick={resetRoomForm}>
                  Huỷ sửa
                </button>
              ) : null}
              <span>Khung đề phải cùng môn với phòng. Phòng phải “Đang mở” thì key mới vào thi được.</span>
            </div>

            {roomsFeedback ? <p className={styles.feedback}>{roomsFeedback}</p> : null}
          </form>

          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Phòng</th>
                  <th>Môn</th>
                  <th>Thời lượng</th>
                  <th>Câu / Đề</th>
                  <th>Khung giờ</th>
                  <th>Trạng thái</th>
                  <th>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {rooms.length === 0 ? (
                  <tr>
                    <td className={styles.emptyCell} colSpan={7}>
                      {isLoadingRooms ? 'Đang tải phòng thi...' : 'Chưa có phòng thi nào. Tạo phòng ở form phía trên.'}
                    </td>
                  </tr>
                ) : (
                  rooms.map((room) => (
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
                              onClick={() => handleRoomStatus(room, 'published')}
                            >
                              <DoorOpen size={15} />
                            </button>
                          ) : null}
                          <button
                            type="button"
                            className={styles.iconAction}
                            title="Sửa phòng"
                            onClick={() => handleEditRoom(room)}
                          >
                            <FilePenLine size={15} />
                          </button>
                          {room.status !== 'archived' ? (
                            <button
                              type="button"
                              className={styles.iconAction}
                              title="Đóng phòng"
                              onClick={() => handleRoomStatus(room, 'archived')}
                            >
                              <Archive size={15} />
                            </button>
                          ) : null}
                          <button
                            type="button"
                            className={`${styles.iconAction} ${styles.iconDanger}`}
                            title="Xoá phòng"
                            onClick={() => handleDeleteRoom(room)}
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section id="keys" className={styles.panel}>
          <div className={styles.panelHeader}>
            <div>
              <h2>Quản lý key</h2>
              <p>Tạo key public hoặc cá nhân, đặt quota và theo dõi lượt sử dụng.</p>
            </div>
            <button
              className="btn outline small"
              type="button"
              onClick={loadKeyManagement}
              disabled={isLoadingKeys || !hasConfiguredSupabase}
            >
              <RefreshCw size={15} />
              Tải lại
            </button>
          </div>

          <form className={`${styles.form} ${styles.keyForm}`} onSubmit={handleCreateKeys}>
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
                <Plus size={16} />
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

            {keyFeedback ? <p className={styles.feedback}>{keyFeedback}</p> : null}
          </form>

          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Key</th>
                  <th>Loại</th>
                  <th>Hiệu lực</th>
                  <th>Học viên</th>
                  <th>Lượt</th>
                  <th>Hết hạn</th>
                  <th>Trạng thái</th>
                  <th>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {keys.length === 0 ? (
                  <tr>
                    <td className={styles.emptyCell} colSpan={8}>
                      {isLoadingKeys ? 'Đang tải key...' : 'Chưa có key nào được tạo.'}
                    </td>
                  </tr>
                ) : (
                  keys.map((key) => (
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
                            onClick={() => handleRevokeKey(key)}
                            disabled={key.rawStatus !== 'unused' && key.rawStatus !== 'active'}
                          >
                            <Ban size={15} />
                          </button>
                          <button
                            type="button"
                            className={styles.iconAction}
                            title="Gia hạn hết hạn"
                            onClick={() => handleExtendKey(key)}
                            disabled={key.rawStatus === 'revoked'}
                          >
                            <CalendarClock size={15} />
                          </button>
                          <button
                            type="button"
                            className={`${styles.iconAction} ${styles.iconDanger}`}
                            title="Xoá key"
                            onClick={() => handleDeleteKey(key)}
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section id="students" className={styles.panel}>
          <div className={styles.panelHeader}>
            <div>
              <h2>Quản lý học viên</h2>
              <p>Tìm kiếm học viên, trường và key được gán.</p>
            </div>
            <label className={styles.search}>
              <Search size={16} />
              <input
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Tìm học viên..."
              />
            </label>
          </div>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>SBD</th>
                  <th>Họ tên</th>
                  <th>Trường</th>
                  <th>Key hiện tại</th>
                </tr>
              </thead>
              <tbody>
                {filteredStudents.length === 0 ? (
                  <tr>
                    <td className={styles.emptyCell} colSpan={4}>
                      {isLoadingCatalog ? 'Đang tải học viên...' : 'Chưa có học viên trong cơ sở dữ liệu.'}
                    </td>
                  </tr>
                ) : (
                  filteredStudents.map((student) => (
                    <tr key={student.code}>
                      <td><strong>{student.code}</strong></td>
                      <td>{student.name}</td>
                      <td>{student.school}</td>
                      <td>{student.key}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}
