'use client';

import { useMemo, useState, useTransition } from 'react';
import { AlertCircle, CheckCircle2, FileJson, X } from 'lucide-react';
import { buildAuthoringDsl } from '@/lib/authoring/importAdapter';
import {
  resolveQuestionType,
  validateImportDocument,
  type ImportDocument,
} from '@/lib/authoring/importSchema';
import type {
  AuthoringDocument,
  AuthoringMode,
  AuthoringPaper,
  AuthoringSubject,
} from '@/lib/authoring/types';
import { createAuthoringDocument } from './actions';
import styles from '@/styles/authoring.module.css';

type Props = {
  subjects: AuthoringSubject[];
  papers: AuthoringPaper[];
  onClose: () => void;
  onCreated: (document: AuthoringDocument, sourcePaperId: string) => void;
};

type Checked = {
  ok: boolean;
  errors: string[];
  document: ImportDocument | null;
};

const SAMPLE = `{
  "source": { "subjectCode": "TOAN", "year": 2026, "school": "THPT ..." },
  "questions": [
    {
      "part": "I",
      "content": "Giá trị nhỏ nhất của $f(x)=(x-1)^2$?",
      "options": [
        { "label": "A", "content": "$0$", "correct": true },
        { "label": "B", "content": "$1$" }
      ],
      "explanation": "..."
    },
    { "part": "III", "content": "Tính $2+2$.", "answer": 4 }
  ]
}`;

const typeLabels: Record<string, string> = {
  multiple_choice: 'Trắc nghiệm',
  true_false: 'Đúng/Sai',
  short_answer: 'Trả lời ngắn',
  essay: 'Tự luận',
};

export default function ImportModal({
  subjects,
  papers,
  onClose,
  onCreated,
}: Props) {
  const [jsonText, setJsonText] = useState('');
  const [checked, setChecked] = useState<Checked | null>(null);
  const [title, setTitle] = useState('');
  const [subjectCode, setSubjectCode] = useState('');
  const [mode, setMode] = useState<AuthoringMode>('question');
  const [sourcePaperId, setSourcePaperId] = useState('');
  const [error, setError] = useState('');
  const [isPending, startTransition] = useTransition();

  const questionCount = checked?.document?.questions.length ?? 0;
  const canBank = questionCount === 1;

  const typeSummary = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const question of checked?.document?.questions ?? []) {
      const type = resolveQuestionType(question) ?? 'unknown';
      counts[type] = (counts[type] ?? 0) + 1;
    }
    return counts;
  }, [checked]);

  const subjectPapers = papers.filter(
    (paper) => paper.subjectCode === subjectCode,
  );

  const handleCheck = () => {
    setError('');
    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonText);
    } catch {
      setChecked({ ok: false, errors: ['JSON không hợp lệ (sai cú pháp).'], document: null });
      return;
    }
    const result = validateImportDocument(parsed);
    setChecked(result);
    if (result.ok && result.document) {
      const nextSubject = result.document.source.subjectCode.trim().toUpperCase();
      setSubjectCode(nextSubject);
      const src = result.document.source;
      const parts = [src.school, src.year ? `${src.year}` : null].filter(Boolean);
      setTitle(parts.length ? `Nạp: ${parts.join(' ')}` : 'Đề nạp từ JSON');
      setMode(result.document.questions.length === 1 ? 'question' : 'paper');
    }
  };

  const handleCreate = () => {
    if (!checked?.ok || !checked.document) return;
    const finalMode: AuthoringMode = canBank ? mode : 'paper';

    if (finalMode === 'paper' && !sourcePaperId) {
      setError('Chế độ "Cả đề" cần chọn phòng/đề đích.');
      return;
    }
    if (!subjectCode.trim()) {
      setError('Cần mã môn học.');
      return;
    }

    const dsl = buildAuthoringDsl(checked.document, {
      wrap: finalMode === 'paper',
    });

    setError('');
    startTransition(async () => {
      const result = await createAuthoringDocument({
        mode: finalMode,
        title: title.trim() || 'Đề nạp từ JSON',
        subjectCode: subjectCode.trim().toUpperCase(),
        sourcePaperId: finalMode === 'paper' ? sourcePaperId : null,
        seedSource: dsl,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onCreated(result.document, sourcePaperId);
    });
  };

  return (
    <div className={styles.modalBackdrop}>
      <div className={`${styles.modal} ${styles.modalWide}`}>
        <div className={styles.modalHeader}>
          <div>
            <span>Nạp đề hàng loạt</span>
            <h2>Nạp câu hỏi từ JSON</h2>
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

        <label>
          Dán JSON (theo hợp đồng nạp đề — part I/II/III hoặc type)
          <textarea
            className={styles.formTextarea}
            value={jsonText}
            onChange={(event) => {
              setJsonText(event.target.value);
              setChecked(null);
            }}
            rows={8}
            placeholder={SAMPLE}
          />
        </label>

        <details className={styles.sampleDetails}>
          <summary>Xem mẫu JSON</summary>
          <pre className={styles.sampleBlock}>{SAMPLE}</pre>
        </details>

        <button
          type="button"
          className={styles.secondaryButton}
          onClick={handleCheck}
          disabled={jsonText.trim() === ''}
        >
          Kiểm tra JSON
        </button>

        {checked && !checked.ok ? (
          <div className={styles.importErrors}>
            <strong>
              <AlertCircle size={15} /> {checked.errors.length} lỗi cần sửa:
            </strong>
            <ul>
              {checked.errors.slice(0, 12).map((message, index) => (
                <li key={index}>{message}</li>
              ))}
            </ul>
            {checked.errors.length > 12 ? (
              <small>… và {checked.errors.length - 12} lỗi khác.</small>
            ) : null}
          </div>
        ) : null}

        {checked?.ok ? (
          <>
            <div className={styles.importOk}>
              <CheckCircle2 size={16} /> Hợp lệ: {questionCount} câu
              {Object.entries(typeSummary).map(([type, count]) => (
                <span key={type} className={styles.importChip}>
                  {typeLabels[type] ?? type}: {count}
                </span>
              ))}
            </div>

            <div className={styles.formRow}>
              <label>
                Tiêu đề bản nháp
                <input
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="Đề nạp từ JSON"
                />
              </label>
              <label>
                Môn học
                <select
                  value={subjectCode}
                  onChange={(event) => setSubjectCode(event.target.value)}
                >
                  <option value="">Chọn môn</option>
                  {subjects.map((subject) => (
                    <option key={subject.code} value={subject.code}>
                      {subject.name} ({subject.code})
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className={styles.modeChoices}>
              <label>
                <input
                  type="radio"
                  name="importMode"
                  checked={canBank && mode === 'question'}
                  disabled={!canBank}
                  onChange={() => setMode('question')}
                />
                <span>
                  <strong>Vào ngân hàng</strong>
                  <small>
                    {canBank ? 'Câu đơn, không gắn phòng thi' : 'Chỉ khi có đúng 1 câu'}
                  </small>
                </span>
              </label>
              <label>
                <input
                  type="radio"
                  name="importMode"
                  checked={!canBank || mode === 'paper'}
                  onChange={() => setMode('paper')}
                />
                <span>
                  <strong>Cả đề (gắn phòng thi)</strong>
                  <small>Ghi vào ngân hàng + ráp thành đề của 1 phòng</small>
                </span>
              </label>
            </div>

            {(!canBank || mode === 'paper') ? (
              <label>
                Phòng/đề đích
                <select
                  value={sourcePaperId}
                  onChange={(event) => setSourcePaperId(event.target.value)}
                >
                  <option value="">Chọn phòng/đề</option>
                  {subjectPapers.map((paper) => (
                    <option key={paper.id} value={paper.id}>
                      {paper.roomName} · {paper.label}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}

            <button
              className={styles.primaryModalButton}
              onClick={handleCreate}
              disabled={isPending}
            >
              <FileJson size={16} />
              {isPending ? 'Đang tạo...' : 'Tạo bản nháp để review'}
            </button>
            <p className={styles.modalHint}>
              Bản nháp sẽ mở trong workspace — kiểm tra preview KaTeX rồi bấm
              Xuất bản để ghi vào ngân hàng.
            </p>
          </>
        ) : null}
      </div>
    </div>
  );
}
