import type { AppSupabaseClient, Json } from './database';

type PublishedRoomRecord = {
  id: string;
  code: string;
  name: string;
  duration_minutes: number;
  status: string;
  price_vnd: number | null;
  total_attempts_default: number | null;
  starts_at: string | null;
  ends_at: string | null;
  published_at: string | null;
  blueprint_code: string | null;
  blueprint_name: string | null;
  subject_code: string;
  subject_name: string;
};

type SubjectRecord = {
  code: string;
  name: string;
  default_duration_minutes: number;
  is_compulsory: boolean;
  is_active: boolean;
};

/* Hình dạng JSON câu hỏi do RPC get_active_exam_session_full trả về (đã phẳng, không
 * lồng như PostgREST embed). KHÔNG có đáp án đúng — đang làm bài. */
type RpcSessionQuestionRecord = {
  id: string;
  question_seq: number;
  display_no: string | null;
  max_points: number | string;
  question_id: string;
  code: string;
  type: ExamQuestionType;
  content: string;
  content_format_version?: number | null;
  image_url: string | null;
  image_alt_text: string | null;
  image_width_px: number | null;
  image_height_px: number | null;
  options:
    | {
        id: string;
        seq: number;
        label: string;
        content: string;
        image_url: string | null;
        image_alt_text: string | null;
        image_width_px: number | null;
        image_height_px: number | null;
      }[]
    | null;
  true_false_items:
    | { id: string; seq: number; label: string | null; content: string }[]
    | null;
};

type RpcExamSessionPayload = {
  session: {
    id: string;
    status: string;
    attempt_number: number;
    started_at: string;
    due_at: string | null;
    submitted_at: string | null;
    score: number | string | null;
    max_score: number | string;
    exam_room_id: string;
  } | null;
  room: PublishedRoomRecord | null;
  questions: RpcSessionQuestionRecord[] | null;
  answers: SessionAnswerRecord[] | null;
};

type SessionAnswerRecord = {
  session_question_id: string;
  answer_json: unknown;
  selected_option_id: string | null;
  short_answer_text: string | null;
  is_correct: boolean | null;
  earned_points: number | null;
};

export type SubjectSummary = {
  code: string;
  name: string;
  defaultDurationMinutes: number;
  isCompulsory: boolean;
  isActive: boolean;
  openRoomCount: number;
};

export type ExamRoomSummary = {
  id: string;
  code: string;
  name: string;
  durationMinutes: number;
  priceVnd: number;
  totalAttemptsDefault: number;
  startsAt: string | null;
  endsAt: string | null;
  publishedAt: string | null;
  blueprintCode: string | null;
  blueprintName: string | null;
  subjectCode: string;
  subjectName: string;
};

export type ExamQuestionType =
  | 'multiple_choice'
  | 'true_false'
  | 'short_answer'
  | 'essay';

export type ExamQuestionOption = {
  id: string;
  seq: number;
  label: string;
  content: string;
  imageUrl: string | null;
  imageAltText: string | null;
  imageWidth: number | null;
  imageHeight: number | null;
};

export type ExamTrueFalseItem = {
  id: string;
  seq: number;
  label: string | null;
  content: string;
};

export type ExamSessionQuestion = {
  id: string;
  number: number;
  displayNo: string;
  maxPoints: number;
  questionId: string;
  code: string;
  type: ExamQuestionType;
  content: string;
  contentFormatVersion: number;
  imageUrl: string | null;
  imageAltText: string | null;
  imageWidth: number | null;
  imageHeight: number | null;
  options: ExamQuestionOption[];
  trueFalseItems: ExamTrueFalseItem[];
};

export type ExamSessionAnswer = {
  sessionQuestionId: string;
  answerJson: unknown;
  selectedOptionId: string | null;
  shortAnswerText: string | null;
  isCorrect: boolean | null;
  earnedPoints: number | null;
};

export type ExamSessionData = {
  session: {
    id: string;
    status: string;
    attemptNumber: number;
    startedAt: string;
    dueAt: string | null;
    submittedAt: string | null;
    score: number | null;
    maxScore: number;
    examRoomId: string;
  };
  room: ExamRoomSummary | null;
  questions: ExamSessionQuestion[];
  answers: ExamSessionAnswer[];
};

/**
 * Trích thông báo lỗi từ mọi dạng error.
 *
 * Lỗi PostgREST trả về là object thường ({ message, code, details, hint }) chứ
 * KHÔNG phải instance của Error, nên `error instanceof Error` là false và message
 * thật bị nuốt mất sau fallback chung chung. Hàm này lấy được message từ cả
 * Error lẫn PostgrestError, kèm mã lỗi nếu có để dễ chẩn đoán.
 */
export function getSupabaseErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object') {
    const candidate = error as { message?: unknown; code?: unknown };
    if (candidate.code === '42501') {
      return 'Phiên đăng nhập không còn quyền lưu bài. Vui lòng tải lại trang để tiếp tục.';
    }
    if (typeof candidate.message === 'string' && candidate.message.length > 0) {
      return typeof candidate.code === 'string' && candidate.code.length > 0
        ? `${candidate.message} (${candidate.code})`
        : candidate.message;
    }
  }
  return fallback;
}

function mapRoom(record: PublishedRoomRecord): ExamRoomSummary {
  return {
    id: record.id,
    code: record.code,
    name: record.name,
    durationMinutes: record.duration_minutes,
    priceVnd: record.price_vnd ?? 0,
    totalAttemptsDefault: record.total_attempts_default ?? 3,
    startsAt: record.starts_at,
    endsAt: record.ends_at,
    publishedAt: record.published_at,
    blueprintCode: record.blueprint_code,
    blueprintName: record.blueprint_name,
    subjectCode: record.subject_code,
    subjectName: record.subject_name,
  };
}

function mapRpcSessionQuestion(
  record: RpcSessionQuestionRecord,
): ExamSessionQuestion {
  // RPC đã sắp options/true_false_items theo seq và câu hỏi theo question_seq,
  // nên không cần sort lại ở client.
  return {
    id: record.id,
    number: record.question_seq,
    displayNo: record.display_no ?? String(record.question_seq),
    maxPoints: Number(record.max_points),
    questionId: record.question_id,
    code: record.code,
    type: record.type,
    content: record.content,
    contentFormatVersion: record.content_format_version ?? 1,
    imageUrl: record.image_url,
    imageAltText: record.image_alt_text,
    imageWidth: record.image_width_px,
    imageHeight: record.image_height_px,
    options: (record.options ?? []).map((option) => ({
      id: option.id,
      seq: option.seq,
      label: option.label,
      content: option.content,
      imageUrl: option.image_url,
      imageAltText: option.image_alt_text,
      imageWidth: option.image_width_px,
      imageHeight: option.image_height_px,
    })),
    trueFalseItems: (record.true_false_items ?? []).map((item) => ({
      id: item.id,
      seq: item.seq,
      label: item.label,
      content: item.content,
    })),
  };
}

export function formatPriceVnd(value: number) {
  if (value <= 0) return 'Miễn phí';

  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0,
  }).format(value);
}

export function difficultyLabel(value: number | null | undefined) {
  switch (value) {
    case 1:
      return 'Nhận biết';
    case 2:
      return 'Thông hiểu';
    case 3:
      return 'Vận dụng';
    case 4:
      return 'Vận dụng cao';
    default:
      return 'Chưa phân loại';
  }
}

export function questionTypeLabel(type: ExamQuestionType) {
  switch (type) {
    case 'multiple_choice':
      return 'Trắc nghiệm';
    case 'true_false':
      return 'Đúng/Sai';
    case 'short_answer':
      return 'Trả lời ngắn';
    case 'essay':
      return 'Tự luận';
    default:
      return 'Câu hỏi';
  }
}

/* ─── Cache nhẹ cho dữ liệu tham chiếu gần-tĩnh ───────────────────────────
 * Danh sách môn thi + phòng đã mở giống nhau cho mọi người dùng và đổi rất
 * hiếm. Cache trong bộ nhớ tab ~60s để các lần điều hướng sau dùng lại, đồng
 * thời gộp các lần gọi trùng đang bay (in-flight stampede). KHÔNG dùng cho dữ
 * liệu cá nhân (profile, phiên thi) — những thứ đó vẫn gọi trực tiếp. */
const REFERENCE_TTL_MS = 60_000;

type ReferenceCacheEntry = { promise: Promise<unknown>; expires: number };
const referenceCache = new Map<string, ReferenceCacheEntry>();

function cachedReference<T>(
  key: string,
  loader: () => Promise<T>,
  ttlMs = REFERENCE_TTL_MS,
): Promise<T> {
  const now = Date.now();
  const hit = referenceCache.get(key);
  if (hit && hit.expires > now) {
    return hit.promise as Promise<T>;
  }

  const promise = loader().catch((error) => {
    // Không cache lỗi: gỡ entry để lần sau thử lại.
    if (referenceCache.get(key)?.promise === promise) {
      referenceCache.delete(key);
    }
    throw error;
  });

  referenceCache.set(key, { promise, expires: now + ttlMs });
  return promise;
}

/** Xóa cache dữ liệu tham chiếu — gọi khi đăng xuất / vừa đổi môn-phòng. */
export function clearReferenceCache() {
  referenceCache.clear();
}

const PUBLISHED_ROOM_COLUMNS = [
  'id',
  'code',
  'name',
  'duration_minutes',
  'status',
  'price_vnd',
  'total_attempts_default',
  'starts_at',
  'ends_at',
  'published_at',
  'blueprint_code',
  'blueprint_name',
  'subject_code',
  'subject_name',
].join(',');

async function loadPublishedRooms(
  supabase: AppSupabaseClient,
  subjectCode?: string,
): Promise<ExamRoomSummary[]> {
  let query = supabase
    .from('v_exam_rooms_full')
    .select(PUBLISHED_ROOM_COLUMNS)
    .eq('status', 'published')
    .order('subject_name', { ascending: true })
    .order('published_at', { ascending: false });

  if (subjectCode) {
    query = query.eq('subject_code', subjectCode.toUpperCase());
  }

  const { data, error } = await query;
  if (error) throw error;

  return ((data ?? []) as unknown as PublishedRoomRecord[]).map(mapRoom);
}

export function fetchPublishedRooms(
  supabase: AppSupabaseClient,
  subjectCode?: string,
): Promise<ExamRoomSummary[]> {
  const key = `rooms:${subjectCode ? subjectCode.toUpperCase() : 'all'}`;
  return cachedReference(key, () => loadPublishedRooms(supabase, subjectCode));
}

type SubjectBase = Omit<SubjectSummary, 'openRoomCount'>;

function mapSubjectBase(record: SubjectRecord): SubjectBase {
  return {
    code: record.code,
    name: record.name,
    defaultDurationMinutes: record.default_duration_minutes,
    isCompulsory: record.is_compulsory,
    isActive: record.is_active,
  };
}

/** Đếm số phòng đã mở cho từng môn (dùng chung 1 mảng rooms, không query lại). */
function attachRoomCounts(
  subjectBases: SubjectBase[],
  rooms: ExamRoomSummary[],
): SubjectSummary[] {
  const roomCounts = new Map<string, number>();
  rooms.forEach((room) => {
    roomCounts.set(room.subjectCode, (roomCounts.get(room.subjectCode) ?? 0) + 1);
  });

  return subjectBases.map((subject) => ({
    ...subject,
    openRoomCount: roomCounts.get(subject.code) ?? 0,
  }));
}

async function loadActiveSubjects(
  supabase: AppSupabaseClient,
): Promise<SubjectBase[]> {
  const { data, error } = await supabase
    .from('subjects')
    .select('code,name,default_duration_minutes,is_compulsory,is_active')
    .eq('is_active', true)
    .order('is_compulsory', { ascending: false })
    .order('name', { ascending: true });

  if (error) throw error;

  return ((data ?? []) as unknown as SubjectRecord[]).map(mapSubjectBase);
}

/**
 * Tải MỘT lần cả môn thi và phòng đã mở, rồi tính số phòng/môn ngay trên
 * client. Dùng cho các đường đi cần dữ liệu môn+phòng (đã cache 60s). Trang
 * /subjects nay gọi fetchSubjectsDashboard (gộp luôn profile + phiên dở vào 1
 * RPC); hàm này giữ lại cho các consumer khác.
 */
export async function fetchSubjectsAndRooms(
  supabase: AppSupabaseClient,
): Promise<{ subjects: SubjectSummary[]; rooms: ExamRoomSummary[] }> {
  const [subjectBases, rooms] = await Promise.all([
    cachedReference('subjects:active', () => loadActiveSubjects(supabase)),
    fetchPublishedRooms(supabase),
  ]);

  return { subjects: attachRoomCounts(subjectBases, rooms), rooms };
}

export type SubjectsDashboard = {
  subjects: SubjectSummary[];
  rooms: ExamRoomSummary[];
  practice: PracticeAvailability[];
  attemptBalance: number;
  role: string | null;
  activeSession: ActiveSessionInfo | null;
};

export type PracticeAvailability = {
  subjectCode: string;
  subjectName: string;
  roomId: string | null;
  roomName: string | null;
  attemptCost: number;
  approvedQuestionCount: number;
  available: boolean;
};

/**
 * Gộp toàn bộ dữ liệu trang /subjects vào 1 round-trip qua RPC
 * get_subjects_dashboard: môn đang mở + phòng đã publish (dùng chung để đếm
 * phòng/môn) + profile của người gọi (lấy role) + phiên đang làm dở. Trước đây
 * trang bắn 3-4 request song song tới Supabase (Mumbai); nay chỉ 1.
 *
 * Có cache 30s + dedupe in-flight (dùng chung cachedReference): điều hướng
 * qua lại /subjects ↔ /practice ↔ /subjects/:code dùng lại kết quả, không
 * bắn RPC mới. Riêng phiên đang dở có thể cũ tối đa 30s — chấp nhận được cho
 * banner "Tiếp tục bài thi" (trang exam vẫn kiểm tra status thật khi mở).
 */
const SUBJECTS_DASHBOARD_TTL_MS = 30_000;

export async function fetchSubjectsDashboard(
  supabase: AppSupabaseClient,
): Promise<SubjectsDashboard> {
  return cachedReference(
    'subjects:dashboard',
    () => loadSubjectsDashboard(supabase),
    SUBJECTS_DASHBOARD_TTL_MS,
  );
}

async function loadSubjectsDashboard(
  supabase: AppSupabaseClient,
): Promise<SubjectsDashboard> {
  const { data, error } = await supabase.rpc('get_subjects_dashboard');
  if (error) throw error;
  if (!data || typeof data !== 'object') {
    throw new Error('Không tải được dữ liệu trang môn thi.');
  }

  const payload = data as {
    subjects: SubjectRecord[] | null;
    rooms: PublishedRoomRecord[] | null;
    practice?: {
      subject_code: string;
      subject_name: string;
      room_id: string | null;
      room_name: string | null;
      attempt_cost: number;
      approved_question_count: number;
      available: boolean | null;
    }[] | null;
    attempt_balance?: number | string | null;
    profile: { role?: string | null } | null;
    active_session: Record<string, unknown> | null;
  };

  const subjectBases = (payload.subjects ?? []).map(mapSubjectBase);
  const rooms = (payload.rooms ?? []).map(mapRoom);

  return {
    subjects: attachRoomCounts(subjectBases, rooms),
    rooms,
    practice: (payload.practice ?? []).map((practice) => ({
      subjectCode: practice.subject_code,
      subjectName: practice.subject_name,
      roomId: practice.room_id,
      roomName: practice.room_name,
      attemptCost: Number(practice.attempt_cost ?? 3),
      approvedQuestionCount: Number(practice.approved_question_count ?? 0),
      available: Boolean(practice.available),
    })),
    attemptBalance: Number(payload.attempt_balance ?? 0),
    role: payload.profile?.role ?? null,
    activeSession: mapActiveSession(payload.active_session),
  };
}

export async function fetchSubjectWithRooms(
  supabase: AppSupabaseClient,
  subjectCode: string,
) {
  const normalizedCode = subjectCode.toUpperCase();
  const dashboard = await fetchSubjectsDashboard(supabase);
  const rooms = dashboard.rooms.filter(
    (room) => room.subjectCode === normalizedCode,
  );
  const subjectRecord = dashboard.subjects.find(
    (subject) => subject.code === normalizedCode,
  );
  const subject = subjectRecord
    ? { ...subjectRecord, openRoomCount: rooms.length }
    : null;

  return { subject, rooms };
}

export async function fetchExamRoomById(
  supabase: AppSupabaseClient,
  roomId: string,
) {
  const { data, error } = await supabase
    .from('v_exam_rooms_full')
    .select(
      [
        'id',
        'code',
        'name',
        'duration_minutes',
        'status',
        'price_vnd',
        'total_attempts_default',
        'starts_at',
        'ends_at',
        'published_at',
        'blueprint_code',
        'blueprint_name',
        'subject_code',
        'subject_name',
      ].join(','),
    )
    .eq('id', roomId)
    .maybeSingle();

  if (error) throw error;
  return data ? mapRoom(data as unknown as PublishedRoomRecord) : null;
}

export async function startFreeExamSession(
  supabase: AppSupabaseClient,
  input: { subjectCode: string; examRoomId: string },
) {
  const { data, error } = await supabase.rpc('start_free_exam_session', {
    p_subject_code: input.subjectCode.toUpperCase(),
    p_exam_room_id: input.examRoomId,
  });

  if (error) throw error;
  if (!data) throw new Error('Kh?ng t?o ???c phi?n thi mi?n ph?.');
  return data;
}

export async function startPracticeSession(
  supabase: AppSupabaseClient,
  input: {
    subjectCode: string;
    questionCount: number;
    knowledgeFieldIds?: number[];
    difficulties?: number[];
  },
) {
  const { data, error } = await supabase.rpc('start_practice_session', {
    p_subject_code: input.subjectCode.toUpperCase(),
    p_question_count: input.questionCount,
    p_knowledge_field_ids: input.knowledgeFieldIds?.length
      ? input.knowledgeFieldIds
      : undefined,
    p_difficulties: input.difficulties?.length ? input.difficulties : undefined,
  });

  if (error) throw error;
  if (!data) throw new Error('Không tạo được phiên tự luyện.');
  return data;
}

/**
 * Tải toàn bộ dữ liệu 1 phiên thi qua RPC get_active_exam_session_full: session +
 * room + câu hỏi + đáp án đã chọn của chính thí sinh, GỘP trong 1 round-trip.
 * Trước đây hàm này chạy 3 chặng nối tiếp tới Supabase (Mumbai): lấy session ->
 * lấy questions+room -> lấy answers. RPC không lộ đáp án đúng (đang làm bài).
 */
export async function fetchExamSessionData(
  supabase: AppSupabaseClient,
  sessionId: string,
): Promise<ExamSessionData> {
  const { data, error } = await supabase.rpc('get_active_exam_session_full', {
    p_session_id: sessionId,
  });
  if (error) throw error;
  if (!data || typeof data !== 'object') {
    throw new Error('Không tìm thấy phiên thi trong cơ sở dữ liệu.');
  }

  const payload = data as RpcExamSessionPayload;
  const s = payload.session;
  if (!s) {
    throw new Error('Không tìm thấy phiên thi trong cơ sở dữ liệu.');
  }

  return {
    session: {
      id: s.id,
      status: s.status,
      attemptNumber: s.attempt_number,
      startedAt: s.started_at,
      dueAt: s.due_at,
      submittedAt: s.submitted_at,
      score: s.score === null || s.score === undefined ? null : Number(s.score),
      maxScore: Number(s.max_score),
      examRoomId: s.exam_room_id,
    },
    room: payload.room ? mapRoom(payload.room) : null,
    questions: (payload.questions ?? []).map(mapRpcSessionQuestion),
    answers: (payload.answers ?? []).map((answer) => ({
      sessionQuestionId: answer.session_question_id,
      answerJson: answer.answer_json,
      selectedOptionId: answer.selected_option_id,
      shortAnswerText: answer.short_answer_text,
      isCorrect: answer.is_correct,
      earnedPoints: answer.earned_points,
    })),
  };
}

export type SessionAnswerInput = {
  sessionQuestionId: string;
  selectedOptionId?: string | null;
  shortAnswerText?: string | null;
  answerJson: Record<string, unknown>;
};

/**
 * Lưu nhiều đáp án trong một RPC. student_id được lấy từ auth.uid() ở Postgres,
 * không nhận từ client, nên payload luôn khớp với RLS của phiên đang làm.
 */
export async function saveSessionAnswers(
  supabase: AppSupabaseClient,
  sessionId: string,
  rows: SessionAnswerInput[],
) {
  if (rows.length === 0) return;

  const payload = rows.map((row) => ({
    session_question_id: row.sessionQuestionId,
    selected_option_id: row.selectedOptionId ?? null,
    short_answer_text: row.shortAnswerText ?? null,
    answer_json: row.answerJson,
  }));

  const { error } = await supabase.rpc('save_session_answers', {
    p_session_id: sessionId,
    p_answers: payload as unknown as Json,
  });

  if (error) throw error;
}

export type ActiveSessionInfo = {
  sessionId: string;
  examRoomId: string;
  roomName: string;
  roomCode: string;
  subjectName: string | null;
  startedAt: string;
  dueAt: string | null;
};

/** Map JSON phiên-đang-dở (từ get_active_session / get_subjects_dashboard). */
function mapActiveSession(
  record: Record<string, unknown> | null | undefined,
): ActiveSessionInfo | null {
  if (!record || typeof record !== 'object' || !record.session_id) return null;

  return {
    sessionId: String(record.session_id),
    examRoomId: String(record.exam_room_id),
    roomName: String(record.room_name ?? ''),
    roomCode: String(record.room_code ?? ''),
    subjectName: (record.subject_name as string | null) ?? null,
    startedAt: String(record.started_at),
    dueAt: (record.due_at as string | null) ?? null,
  };
}

/**
 * Phiên thi đang dang dở (còn giờ) của học sinh hiện tại, để hiển thị banner
 * "Tiếp tục bài thi". RPC tự kết thúc các phiên đã quá hạn trước khi trả về.
 */
export async function getActiveSession(
  supabase: AppSupabaseClient,
): Promise<ActiveSessionInfo | null> {
  const { data, error } = await supabase.rpc('get_active_session');
  if (error) throw error;
  return mapActiveSession(data as Record<string, unknown> | null);
}

/* ─── Xem lại bài làm (sau khi phiên kết thúc, kèm đáp án đúng) ─────────── */

export type SessionReviewOption = ExamQuestionOption & { correct: boolean };

export type SessionReviewTrueFalseItem = ExamTrueFalseItem & {
  correctValue: boolean | null;
};

export type SessionReviewShortAnswerKey = {
  display: string | null;
  answerType: string | null;
};

export type SessionReviewAnswer = {
  answerJson: unknown;
  selectedOptionId: string | null;
  shortAnswerText: string | null;
  isCorrect: boolean | null;
  earnedPoints: number | null;
} | null;

export type SessionReviewQuestion = {
  id: string;
  number: number;
  displayNo: string;
  maxPoints: number;
  questionId: string;
  code: string;
  type: ExamQuestionType;
  content: string;
  imageUrl: string | null;
  imageAltText: string | null;
  imageWidth: number | null;
  imageHeight: number | null;
  options: SessionReviewOption[];
  trueFalseItems: SessionReviewTrueFalseItem[];
  shortAnswerKeys: SessionReviewShortAnswerKey[];
  answer: SessionReviewAnswer;
};

export type SessionReview = {
  session: {
    id: string;
    status: string;
    attemptNumber: number;
    startedAt: string;
    submittedAt: string | null;
    dueAt: string | null;
    scoredAt: string | null;
    gradingStatus: 'pending_auto' | 'pending_manual' | 'scored' | 'failed';
    gradingError: string | null;
    score: number | null;
    maxScore: number;
    examRoomId: string;
    roomDeleted: boolean;
    roomName: string;
    roomCode: string;
    durationMinutes: number;
    subjectCode: string | null;
    subjectName: string | null;
    blueprintCode: string | null;
    blueprintName: string | null;
  };
  questions: SessionReviewQuestion[];
};

type RawReviewOption = {
  id: string;
  seq: number;
  label: string;
  content: string;
  image_url: string | null;
  image_alt_text: string | null;
  image_width_px?: number | null;
  image_height_px?: number | null;
  correct: boolean;
};

type RawReviewTfItem = {
  id: string;
  seq: number;
  label: string | null;
  content: string;
  correct_value: boolean | null;
};

type RawReviewQuestion = {
  id: string;
  question_seq: number;
  display_no: string | null;
  max_points: number | string;
  question_id: string;
  code: string;
  type: ExamQuestionType;
  content: string;
  image_url: string | null;
  image_alt_text: string | null;
  image_width_px?: number | null;
  image_height_px?: number | null;
  options: RawReviewOption[] | null;
  true_false_items: RawReviewTfItem[] | null;
  short_answer_keys: { display: string | null; answer_type: string | null }[] | null;
  answer: {
    answer_json: unknown;
    selected_option_id: string | null;
    short_answer_text: string | null;
    is_correct: boolean | null;
    earned_points: number | string | null;
  } | null;
};

/**
 * Tải dữ liệu xem lại bài làm qua RPC SECURITY DEFINER get_session_review:
 * chấm điểm nếu cần + trả nội dung câu hỏi và ĐÁP ÁN ĐÚNG (đi vòng RLS an toàn,
 * chỉ cho chủ phiên / staff). Dùng cho trang /result sau khi đã nộp.
 */
export async function fetchSessionReview(
  supabase: AppSupabaseClient,
  sessionId: string,
): Promise<SessionReview> {
  const { data, error } = await supabase.rpc('get_session_review', {
    p_session_id: sessionId,
  });
  if (error) {
    const message = getSupabaseErrorMessage(error, '');
    if (message.includes('ACTIVE_EXAM_IN_PROGRESS')) {
      throw new Error(
        'Bạn đang có một phiên làm bài chưa kết thúc. Đáp án và lời giải sẽ được mở lại sau khi bạn nộp bài hoặc hết giờ.',
      );
    }
    throw error;
  }
  if (!data || typeof data !== 'object') {
    throw new Error('Không tải được kết quả phiên thi.');
  }

  const payload = data as {
    session: Record<string, unknown>;
    questions: RawReviewQuestion[] | null;
  };
  const s = payload.session ?? {};

  const questions: SessionReviewQuestion[] = (payload.questions ?? []).map(
    (q) => ({
      id: q.id,
      number: q.question_seq,
      displayNo: q.display_no ?? String(q.question_seq),
      maxPoints: Number(q.max_points),
      questionId: q.question_id,
      code: q.code,
      type: q.type,
      content: q.content,
      imageUrl: q.image_url,
      imageAltText: q.image_alt_text,
      imageWidth: q.image_width_px ?? null,
      imageHeight: q.image_height_px ?? null,
      options: (q.options ?? []).map((o) => ({
        id: o.id,
        seq: o.seq,
        label: o.label,
        content: o.content,
        imageUrl: o.image_url,
        imageAltText: o.image_alt_text,
        imageWidth: o.image_width_px ?? null,
        imageHeight: o.image_height_px ?? null,
        correct: Boolean(o.correct),
      })),
      trueFalseItems: (q.true_false_items ?? []).map((t) => ({
        id: t.id,
        seq: t.seq,
        label: t.label,
        content: t.content,
        correctValue: t.correct_value,
      })),
      shortAnswerKeys: (q.short_answer_keys ?? []).map((k) => ({
        display: k.display,
        answerType: k.answer_type,
      })),
      answer: q.answer
        ? {
            answerJson: q.answer.answer_json,
            selectedOptionId: q.answer.selected_option_id,
            shortAnswerText: q.answer.short_answer_text,
            isCorrect: q.answer.is_correct,
            earnedPoints:
              q.answer.earned_points === null
                ? null
                : Number(q.answer.earned_points),
          }
        : null,
    }),
  );

  return {
    session: {
      id: String(s.id),
      status: String(s.status),
      attemptNumber: Number(s.attempt_number ?? 1),
      startedAt: String(s.started_at),
      submittedAt: (s.submitted_at as string | null) ?? null,
      dueAt: (s.due_at as string | null) ?? null,
      scoredAt: (s.scored_at as string | null) ?? null,
      gradingStatus:
        (s.grading_status as SessionReview['session']['gradingStatus'] | undefined) ??
        (s.score === null || s.score === undefined ? 'pending_auto' : 'scored'),
      gradingError: (s.grading_error as string | null) ?? null,
      score: s.score === null || s.score === undefined ? null : Number(s.score),
      maxScore: Number(s.max_score ?? 10),
      examRoomId: String(s.exam_room_id),
      roomDeleted: Boolean(s.room_deleted),
      roomName: String(s.room_name ?? ''),
      roomCode: String(s.room_code ?? ''),
      durationMinutes: Number(s.duration_minutes ?? 50),
      subjectCode: (s.subject_code as string | null) ?? null,
      subjectName: (s.subject_name as string | null) ?? null,
      blueprintCode: (s.blueprint_code as string | null) ?? null,
      blueprintName: (s.blueprint_name as string | null) ?? null,
    },
    questions,
  };
}
