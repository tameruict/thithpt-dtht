'use client';

import { FormEvent, useState } from 'react';
import { AlertCircle, Plus, Trash2, UploadCloud, X } from 'lucide-react';
import { buildQuestionDsl } from '@/lib/authoring/importAdapter';
import type { ImportQuestion } from '@/lib/authoring/importSchema';
import type { ExamQuestionType } from '@/lib/supabase/exam-data';
import type {
  AuthoringKnowledgeField,
  AuthoringQuestion,
} from '@/lib/authoring/types';
import { uploadAuthoringImage } from './actions';
import styles from '@/styles/authoring.module.css';

type OptionForm = { content: string; correct: boolean };
type StatementForm = { content: string; correct: boolean };
type RubricForm = { title: string; points: string; description: string };

type QuestionFormState = {
  type: ExamQuestionType;
  difficulty: number;
  section: string;
  knowledgeFieldSlug: string;
  content: string;
  imageUrl: string;
  imageAlt: string;
  explanation: string;
  options: OptionForm[];
  statements: StatementForm[];
  answer: string;
  rubric: RubricForm[];
};

const typeOptions: { value: ExamQuestionType; label: string }[] = [
  { value: 'multiple_choice', label: 'Trắc nghiệm (I)' },
  { value: 'true_false', label: 'Đúng/Sai (II)' },
  { value: 'short_answer', label: 'Trả lời ngắn (III)' },
  { value: 'essay', label: 'Tự luận' },
];

const difficultyOptions = [
  { value: 1, label: 'Nhận biết' },
  { value: 2, label: 'Thông hiểu' },
  { value: 3, label: 'Vận dụng' },
  { value: 4, label: 'Vận dụng cao' },
];

function letter(index: number, base: number) {
  return String.fromCharCode(base + index);
}

function emptyForm(): QuestionFormState {
  return {
    type: 'multiple_choice',
    difficulty: 2,
    section: '',
    knowledgeFieldSlug: '',
    content: '',
    imageUrl: '',
    imageAlt: '',
    explanation: '',
    options: [
      { content: '', correct: true },
      { content: '', correct: false },
      { content: '', correct: false },
      { content: '', correct: false },
    ],
    statements: [
      { content: '', correct: true },
      { content: '', correct: false },
    ],
    answer: '',
    rubric: [],
  };
}

function fromAuthoringQuestion(question: AuthoringQuestion): QuestionFormState {
  const fallback = emptyForm();
  return {
    type: question.type,
    difficulty: question.difficulty,
    section: question.section ?? '',
    knowledgeFieldSlug: question.knowledgeFieldSlug ?? '',
    content: question.content,
    imageUrl: question.image?.url ?? '',
    imageAlt: question.image?.alt ?? '',
    explanation: question.explanation ?? '',
    options: question.options.length
      ? question.options.map((option) => ({
          content: option.content,
          correct: option.correct,
        }))
      : fallback.options,
    statements: question.trueFalseItems.length
      ? question.trueFalseItems.map((item) => ({
          content: item.content,
          correct: item.correct,
        }))
      : fallback.statements,
    answer: question.answer ?? '',
    rubric: question.rubric.map((item) => ({
      title: item.title,
      points: String(item.points),
      description: item.description ?? '',
    })),
  };
}

function validate(form: QuestionFormState): string | null {
  const hasImage = form.imageUrl.trim() !== '' && form.imageAlt.trim() !== '';
  if (form.imageUrl.trim() !== '' && form.imageAlt.trim() === '') {
    return 'Ảnh câu hỏi cần alt text.';
  }
  if (form.content.trim() === '' && !hasImage) {
    return 'Câu hỏi cần nội dung hoặc ảnh.';
  }
  if (form.type === 'multiple_choice') {
    const filled = form.options.filter((option) => option.content.trim() !== '');
    if (filled.length < 2) return 'Câu trắc nghiệm cần ít nhất 2 lựa chọn có nội dung.';
    if (!filled.some((option) => option.correct)) {
      return 'Câu trắc nghiệm cần ít nhất một đáp án đúng.';
    }
  }
  if (form.type === 'true_false') {
    const filled = form.statements.filter((item) => item.content.trim() !== '');
    if (filled.length < 1) return 'Câu đúng/sai cần ít nhất một mệnh đề có nội dung.';
  }
  if (form.type === 'short_answer' && form.answer.trim() === '') {
    return 'Câu trả lời ngắn cần đáp án.';
  }
  return null;
}

function toImportQuestion(form: QuestionFormState): ImportQuestion {
  const question: ImportQuestion = {
    type: form.type,
    difficulty: form.difficulty,
    content: form.content.trim(),
  };

  const section = form.section.trim();
  if (section) question.section = section.toUpperCase();

  const knowledge = form.knowledgeFieldSlug.trim();
  if (knowledge) question.knowledgeFieldSlug = knowledge;

  const explanation = form.explanation.trim();
  if (explanation) question.explanation = explanation;

  if (form.imageUrl.trim() && form.imageAlt.trim()) {
    question.images = [
      { url: form.imageUrl.trim(), alt: form.imageAlt.trim(), target: 'question' },
    ];
  }

  if (form.type === 'multiple_choice') {
    question.options = form.options
      .filter((option) => option.content.trim() !== '')
      .map((option, index) => ({
        label: letter(index, 65),
        content: option.content.trim(),
        correct: option.correct,
      }));
  }

  if (form.type === 'true_false') {
    question.trueFalseItems = form.statements
      .filter((item) => item.content.trim() !== '')
      .map((item, index) => ({
        label: letter(index, 97),
        content: item.content.trim(),
        correct: item.correct,
      }));
  }

  if (form.type === 'short_answer') {
    question.answer = form.answer.trim();
  }

  if (form.type === 'essay') {
    const rubric = form.rubric
      .map((item) => ({
        title: item.title.trim(),
        points: Number(item.points),
        description: item.description.trim() || null,
      }))
      .filter(
        (item) =>
          item.title !== '' && Number.isFinite(item.points) && item.points > 0,
      );
    if (rubric.length) question.rubric = rubric;
  }

  return question;
}

type Props = {
  initial: AuthoringQuestion | null;
  knowledgeFields: AuthoringKnowledgeField[];
  onClose: () => void;
  onSubmit: (dsl: string) => void;
};

export default function QuestionFormModal({
  initial,
  knowledgeFields,
  onClose,
  onSubmit,
}: Props) {
  const [form, setForm] = useState<QuestionFormState>(() =>
    initial ? fromAuthoringQuestion(initial) : emptyForm(),
  );
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);

  const isEdit = initial !== null;

  const patch = (updates: Partial<QuestionFormState>) =>
    setForm((current) => ({ ...current, ...updates }));

  const handleUpload = async (event: FormEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) return;
    const alt = form.imageAlt.trim() || file.name.replace(/\.[^.]+$/, '');

    setUploading(true);
    setError('');
    try {
      const data = new FormData();
      data.set('file', file);
      data.set('alt', alt);
      const result = await uploadAuthoringImage(data);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      patch({ imageUrl: result.url, imageAlt: alt });
    } finally {
      setUploading(false);
      input.value = '';
    }
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const problem = validate(form);
    if (problem) {
      setError(problem);
      return;
    }
    const dsl = buildQuestionDsl(toImportQuestion(form));
    onSubmit(dsl);
  };

  return (
    <div className={styles.modalBackdrop}>
      <form
        className={`${styles.modal} ${styles.modalWide}`}
        onSubmit={handleSubmit}
      >
        <div className={styles.modalHeader}>
          <div>
            <span>Trình soạn dạng form</span>
            <h2>{isEdit ? 'Sửa câu hỏi' : 'Thêm câu hỏi mới'}</h2>
          </div>
          <button type="button" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        {error ? (
          <p className={styles.modalError}>
            <AlertCircle size={15} /> {error}
          </p>
        ) : null}

        <div className={styles.formRow}>
          <label>
            Dạng câu
            <select
              value={form.type}
              onChange={(event) =>
                patch({ type: event.target.value as ExamQuestionType })
              }
            >
              {typeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Độ khó
            <select
              value={form.difficulty}
              onChange={(event) =>
                patch({ difficulty: Number(event.target.value) })
              }
            >
              {difficultyOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className={styles.formRow}>
          <label>
            Phần đề (tuỳ chọn)
            <input
              value={form.section}
              onChange={(event) => patch({ section: event.target.value })}
              placeholder="I, II, III..."
            />
          </label>
          <label>
            Phạm vi kiến thức
            <select
              value={form.knowledgeFieldSlug}
              onChange={(event) =>
                patch({ knowledgeFieldSlug: event.target.value })
              }
            >
              <option value="">Không gán</option>
              {knowledgeFields.map((field) => (
                <option key={field.id} value={field.slug}>
                  {field.grade ? `Lớp ${field.grade} · ` : ''}
                  {field.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label>
          Nội dung câu hỏi (hỗ trợ LaTeX: $x^2$, $$...$$)
          <textarea
            className={styles.formTextarea}
            value={form.content}
            onChange={(event) => patch({ content: event.target.value })}
            rows={3}
            placeholder="Nhập đề bài..."
          />
        </label>

        <div className={styles.imageField}>
          <div className={styles.imageFieldHead}>
            <strong>Ảnh câu hỏi (tuỳ chọn)</strong>
            {form.imageUrl ? (
              <button
                type="button"
                className={styles.textButton}
                onClick={() => patch({ imageUrl: '' })}
              >
                Gỡ ảnh
              </button>
            ) : null}
          </div>
          {form.imageUrl ? (
            // R2 hosts are registry-driven and cannot be enumerated in next/image config.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              className={styles.imagePreview}
              src={form.imageUrl}
              alt={form.imageAlt || 'Ảnh câu hỏi'}
            />
          ) : null}
          <div className={styles.formRow}>
            <label className={styles.uploadLabel}>
              <UploadCloud size={15} />
              {uploading ? 'Đang tải...' : 'Tải ảnh lên R2'}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp,image/avif"
                hidden
                disabled={uploading}
                onChange={handleUpload}
              />
            </label>
            <label>
              Alt text
              <input
                value={form.imageAlt}
                onChange={(event) => patch({ imageAlt: event.target.value })}
                placeholder="Mô tả ảnh"
              />
            </label>
          </div>
        </div>

        {form.type === 'multiple_choice' ? (
          <div className={styles.formSection}>
            <div className={styles.formSectionHead}>
              <strong>Các phương án (tick ô đúng)</strong>
              <button
                type="button"
                className={styles.addRowButton}
                onClick={() =>
                  patch({ options: [...form.options, { content: '', correct: false }] })
                }
              >
                <Plus size={14} /> Thêm phương án
              </button>
            </div>
            <div className={styles.rowList}>
              {form.options.map((option, index) => (
                <div key={index} className={styles.optionRow}>
                  <label className={styles.correctToggle} title="Đáp án đúng">
                    <input
                      type="checkbox"
                      checked={option.correct}
                      onChange={(event) =>
                        patch({
                          options: form.options.map((item, itemIndex) =>
                            itemIndex === index
                              ? { ...item, correct: event.target.checked }
                              : item,
                          ),
                        })
                      }
                    />
                    <span>{letter(index, 65)}</span>
                  </label>
                  <input
                    value={option.content}
                    onChange={(event) =>
                      patch({
                        options: form.options.map((item, itemIndex) =>
                          itemIndex === index
                            ? { ...item, content: event.target.value }
                            : item,
                        ),
                      })
                    }
                    placeholder={`Nội dung phương án ${letter(index, 65)}`}
                  />
                  <button
                    type="button"
                    className={styles.rowRemove}
                    disabled={form.options.length <= 2}
                    onClick={() =>
                      patch({
                        options: form.options.filter(
                          (_, itemIndex) => itemIndex !== index,
                        ),
                      })
                    }
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {form.type === 'true_false' ? (
          <div className={styles.formSection}>
            <div className={styles.formSectionHead}>
              <strong>Các mệnh đề</strong>
              <button
                type="button"
                className={styles.addRowButton}
                onClick={() =>
                  patch({
                    statements: [...form.statements, { content: '', correct: true }],
                  })
                }
              >
                <Plus size={14} /> Thêm mệnh đề
              </button>
            </div>
            <div className={styles.rowList}>
              {form.statements.map((item, index) => (
                <div key={index} className={styles.optionRow}>
                  <span className={styles.statementLabel}>{letter(index, 97)})</span>
                  <input
                    value={item.content}
                    onChange={(event) =>
                      patch({
                        statements: form.statements.map((entry, entryIndex) =>
                          entryIndex === index
                            ? { ...entry, content: event.target.value }
                            : entry,
                        ),
                      })
                    }
                    placeholder={`Mệnh đề ${letter(index, 97)}`}
                  />
                  <select
                    className={styles.tfSelect}
                    value={item.correct ? 'true' : 'false'}
                    onChange={(event) =>
                      patch({
                        statements: form.statements.map((entry, entryIndex) =>
                          entryIndex === index
                            ? { ...entry, correct: event.target.value === 'true' }
                            : entry,
                        ),
                      })
                    }
                  >
                    <option value="true">Đúng</option>
                    <option value="false">Sai</option>
                  </select>
                  <button
                    type="button"
                    className={styles.rowRemove}
                    disabled={form.statements.length <= 1}
                    onClick={() =>
                      patch({
                        statements: form.statements.filter(
                          (_, entryIndex) => entryIndex !== index,
                        ),
                      })
                    }
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {form.type === 'short_answer' ? (
          <label>
            Đáp án
            <input
              value={form.answer}
              onChange={(event) => patch({ answer: event.target.value })}
              placeholder="Ví dụ: 4  hoặc  1,5"
            />
          </label>
        ) : null}

        {form.type === 'essay' ? (
          <div className={styles.formSection}>
            <div className={styles.formSectionHead}>
              <strong>Tiêu chí chấm (rubric, tuỳ chọn)</strong>
              <button
                type="button"
                className={styles.addRowButton}
                onClick={() =>
                  patch({
                    rubric: [
                      ...form.rubric,
                      { title: '', points: '1', description: '' },
                    ],
                  })
                }
              >
                <Plus size={14} /> Thêm tiêu chí
              </button>
            </div>
            <div className={styles.rowList}>
              {form.rubric.map((item, index) => (
                <div key={index} className={styles.rubricRow}>
                  <input
                    value={item.title}
                    onChange={(event) =>
                      patch({
                        rubric: form.rubric.map((entry, entryIndex) =>
                          entryIndex === index
                            ? { ...entry, title: event.target.value }
                            : entry,
                        ),
                      })
                    }
                    placeholder="Tên tiêu chí"
                  />
                  <input
                    className={styles.pointsInput}
                    type="number"
                    step="0.25"
                    min="0"
                    value={item.points}
                    onChange={(event) =>
                      patch({
                        rubric: form.rubric.map((entry, entryIndex) =>
                          entryIndex === index
                            ? { ...entry, points: event.target.value }
                            : entry,
                        ),
                      })
                    }
                    placeholder="Điểm"
                  />
                  <button
                    type="button"
                    className={styles.rowRemove}
                    onClick={() =>
                      patch({
                        rubric: form.rubric.filter(
                          (_, entryIndex) => entryIndex !== index,
                        ),
                      })
                    }
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <label>
          Lời giải / hướng dẫn (tuỳ chọn)
          <textarea
            className={styles.formTextarea}
            value={form.explanation}
            onChange={(event) => patch({ explanation: event.target.value })}
            rows={2}
            placeholder="Giải thích đáp án..."
          />
        </label>

        <button className={styles.primaryModalButton} disabled={uploading}>
          {isEdit ? 'Cập nhật vào editor' : 'Chèn vào editor'}
        </button>
      </form>
    </div>
  );
}
