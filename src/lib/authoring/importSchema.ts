// [A] Kiểm tra hợp lệ dữ liệu nhập đề (JSON theo câu) trước khi sinh DSL.
//
// Đầu vào là JSON do bước trích xuất ngoài app (PaddleOCR-VL) xuất ra — xem
// KE_HOACH_LUU_TRU_DE_THI.md §4. Không dùng zod (dự án chưa có); validate thuần
// TypeScript, trả về danh sách lỗi rõ ràng theo từng câu.

import type { ExamQuestionType } from '@/lib/supabase/exam-data';

export type ImportPart = 'I' | 'II' | 'III';

// Quy ước phần đề THPT 2026 -> question_type.
export const PART_TYPE_MAP: Record<ImportPart, ExamQuestionType> = {
  I: 'multiple_choice',
  II: 'true_false',
  III: 'short_answer',
};

const SUPPORTED_TYPES: readonly ExamQuestionType[] = [
  'multiple_choice',
  'true_false',
  'short_answer',
  'essay',
];

export interface ImportImage {
  /** File ảnh local — dùng để upload R2 (bước sau, ngoài phạm vi module này). */
  path?: string;
  /** URL R2 đã resolve; chỉ khi có url thì DSL mới nhúng ảnh. */
  url?: string;
  alt: string;
  /** 'question' | 'optionA' | 'optionB' ... — vị trí gắn ảnh. */
  target?: string;
}

export interface ImportOption {
  label?: string;
  content?: string;
  correct?: boolean;
}

export interface ImportStatement {
  label?: string;
  content?: string;
  correct: boolean;
}

export interface ImportRubricItem {
  title: string;
  points: number;
  description?: string | null;
}

export interface ImportQuestion {
  part?: ImportPart;
  no?: number;
  type?: ExamQuestionType;
  difficulty?: number;
  knowledgeFieldSlug?: string | null;
  code?: string | null;
  section?: string | null;
  content?: string;
  options?: ImportOption[];
  trueFalseItems?: ImportStatement[];
  answer?: string | number | null;
  explanation?: string | null;
  rubric?: ImportRubricItem[];
  images?: ImportImage[];
}

export interface ImportSource {
  school?: string;
  province?: string;
  year?: number;
  round?: number;
  subjectCode: string;
  driveFileId?: string;
}

export interface ImportDocument {
  source: ImportSource;
  questions: ImportQuestion[];
}

export interface ImportValidationResult {
  ok: boolean;
  errors: string[];
  document: ImportDocument | null;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

/** Suy question_type từ `type` hiện có, nếu không có thì từ `part`. */
export function resolveQuestionType(question: ImportQuestion): ExamQuestionType | null {
  if (question.type && SUPPORTED_TYPES.includes(question.type)) return question.type;
  if (question.part && PART_TYPE_MAP[question.part]) return PART_TYPE_MAP[question.part];
  return null;
}

function hasQuestionImage(question: ImportQuestion): boolean {
  return (question.images ?? []).some(
    (image) => (image.target ?? 'question') === 'question' && isNonEmptyString(image.alt),
  );
}

export function validateImportDocument(input: unknown): ImportValidationResult {
  const errors: string[] = [];

  if (!isObject(input)) {
    return { ok: false, errors: ['Dữ liệu nhập phải là một object JSON.'], document: null };
  }

  if (!isObject(input.source)) {
    errors.push('Thiếu trường "source" (object mô tả nguồn đề).');
  } else if (!isNonEmptyString(input.source.subjectCode)) {
    errors.push('source.subjectCode là bắt buộc (mã môn, ví dụ "TOAN").');
  }

  if (!Array.isArray(input.questions) || input.questions.length === 0) {
    errors.push('Thiếu mảng "questions" (cần ít nhất một câu hỏi).');
    return { ok: false, errors, document: null };
  }

  input.questions.forEach((rawQuestion, index) => {
    const label = `Câu ${index + 1}`;
    if (!isObject(rawQuestion)) {
      errors.push(`${label}: phải là object.`);
      return;
    }
    const question = rawQuestion as ImportQuestion;

    const type = resolveQuestionType(question);
    if (!type) {
      errors.push(`${label}: thiếu type hợp lệ (hoặc part I/II/III để suy ra).`);
      return;
    }

    if (question.difficulty !== undefined) {
      const difficulty = question.difficulty;
      if (!Number.isInteger(difficulty) || difficulty < 1 || difficulty > 4) {
        errors.push(`${label}: difficulty phải là số nguyên 1–4.`);
      }
    }

    const needsContent = type !== 'multiple_choice' || !hasQuestionImage(question);
    if (needsContent && !isNonEmptyString(question.content) && !hasQuestionImage(question)) {
      errors.push(`${label}: cần "content" (hoặc ảnh câu hỏi).`);
    }

    if (type === 'multiple_choice') {
      const options = question.options ?? [];
      if (options.length < 2 || options.length > 10) {
        errors.push(`${label}: câu trắc nghiệm cần 2–10 lựa chọn.`);
      }
      if (!options.some((option) => option?.correct === true)) {
        errors.push(`${label}: câu trắc nghiệm cần ít nhất một đáp án đúng.`);
      }
      options.forEach((option, optionIndex) => {
        const hasImage = (question.images ?? []).some(
          (image) => image.target === `option${(option?.label ?? '').toUpperCase()}` && isNonEmptyString(image.alt),
        );
        if (!isNonEmptyString(option?.content) && !hasImage) {
          errors.push(`${label}: lựa chọn ${optionIndex + 1} cần nội dung hoặc ảnh.`);
        }
      });
    }

    if (type === 'true_false') {
      const items = question.trueFalseItems ?? [];
      if (items.length === 0) {
        errors.push(`${label}: câu đúng/sai cần ít nhất một mệnh đề.`);
      }
      items.forEach((item, itemIndex) => {
        if (typeof item?.correct !== 'boolean') {
          errors.push(`${label}: mệnh đề ${itemIndex + 1} cần "correct" là true/false.`);
        }
        if (!isNonEmptyString(item?.content)) {
          errors.push(`${label}: mệnh đề ${itemIndex + 1} cần nội dung.`);
        }
      });
    }

    if (type === 'short_answer') {
      const answer = question.answer;
      if (!isNonEmptyString(typeof answer === 'number' ? String(answer) : answer)) {
        errors.push(`${label}: câu trả lời ngắn cần "answer".`);
      }
    }
  });

  if (errors.length > 0) {
    return { ok: false, errors, document: null };
  }

  return { ok: true, errors: [], document: input as unknown as ImportDocument };
}
