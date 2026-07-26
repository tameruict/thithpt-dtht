'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Layers,
  Plus,
  Search,
  Trash2,
} from 'lucide-react';
import {
  addToComposition,
  getComposition,
  removeFromComposition,
  searchBankQuestions,
  type BankQuestion,
  type ComposeData,
  type Composition,
} from './actions';
import styles from '@/styles/compose.module.css';

const typeLabels: Record<string, string> = {
  multiple_choice: 'Trắc nghiệm',
  true_false: 'Đúng/Sai',
  short_answer: 'Trả lời ngắn',
  essay: 'Tự luận',
};

const difficultyLabels: Record<number, string> = {
  1: 'Nhận biết',
  2: 'Thông hiểu',
  3: 'Vận dụng',
  4: 'Vận dụng cao',
};

function truncate(value: string, max = 160) {
  const clean = value.replace(/\s+/g, ' ').trim();
  return clean.length > max ? `${clean.slice(0, max)}…` : clean;
}

type Props = { initialData: ComposeData };

export default function ComposeWorkspace({ initialData }: Props) {
  const { papers, knowledgeFields } = initialData;

  const [selectedPaperId, setSelectedPaperId] = useState(papers[0]?.id ?? '');
  const [composition, setComposition] = useState<Composition | null>(null);
  const [bank, setBank] = useState<BankQuestion[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [difficultyFilter, setDifficultyFilter] = useState('');
  const [knowledgeFilter, setKnowledgeFilter] = useState('');

  const [searching, setSearching] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [error, setError] = useState('');

  const selectedPaper = useMemo(
    () => papers.find((paper) => paper.id === selectedPaperId) ?? null,
    [papers, selectedPaperId],
  );
  const subjectCode = selectedPaper?.subjectCode ?? '';

  const subjectKnowledge = useMemo(
    () => knowledgeFields.filter((field) => field.subjectCode === subjectCode),
    [knowledgeFields, subjectCode],
  );

  const placedIds = useMemo(() => {
    const set = new Set<string>();
    for (const section of composition?.sections ?? []) {
      for (const question of section.questions) set.add(question.questionId);
    }
    return set;
  }, [composition]);

  const runSearch = async (paperSubject: string) => {
    if (!paperSubject) return;
    setSearching(true);
    setError('');
    const result = await searchBankQuestions({
      subjectCode: paperSubject,
      type: typeFilter || undefined,
      difficulty: difficultyFilter ? Number(difficultyFilter) : null,
      knowledgeFieldId: knowledgeFilter ? Number(knowledgeFilter) : null,
      query,
    });
    setSearching(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setBank(result.questions);
  };

  // Nạp bố cục + ngân hàng khi đổi đề đích.
  useEffect(() => {
    let active = true;
    (async () => {
      if (!selectedPaperId) {
        if (active) {
          setComposition(null);
          setBank([]);
        }
        return;
      }
      const paper = papers.find((item) => item.id === selectedPaperId);
      setSelectedIds(new Set());
      setFeedback('');

      const compResult = await getComposition(selectedPaperId);
      if (!active) return;
      if (compResult.ok) setComposition(compResult.composition);
      else setError(compResult.error);

      if (paper?.subjectCode) {
        setSearching(true);
        const bankResult = await searchBankQuestions({
          subjectCode: paper.subjectCode,
        });
        if (!active) return;
        setSearching(false);
        if (bankResult.ok) setBank(bankResult.questions);
      }
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPaperId]);

  const toggleSelect = (id: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleAdd = async () => {
    if (!selectedPaperId || selectedIds.size === 0) return;
    setBusy(true);
    setError('');
    const result = await addToComposition(selectedPaperId, [...selectedIds]);
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    const before = placedIds.size;
    setComposition(result.composition);
    const added =
      (result.composition.sections ?? []).reduce(
        (sum, section) => sum + section.questions.length,
        0,
      ) - before;
    setSelectedIds(new Set());
    setFeedback(
      added > 0
        ? `Đã thêm ${added} câu vào đề.`
        : 'Không có câu nào được thêm (sai môn hoặc đã có trong đề).',
    );
  };

  const handleRemove = async (questionId: string) => {
    if (!selectedPaperId) return;
    setBusy(true);
    setError('');
    const result = await removeFromComposition(selectedPaperId, questionId);
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setComposition(result.composition);
    setFeedback('Đã gỡ câu khỏi đề.');
  };

  const totalPlaced = useMemo(
    () =>
      (composition?.sections ?? []).reduce(
        (sum, section) => sum + section.questions.length,
        0,
      ),
    [composition],
  );

  return (
    <div className={styles.shell}>
      <header className={styles.topbar}>
        <div className={styles.brand}>
          <Layers size={20} />
          <div>
            <strong>Dựng đề từ ngân hàng</strong>
            <small>Chọn câu có sẵn → gắn vào đề nháp</small>
          </div>
        </div>
        <label className={styles.paperPicker}>
          Đề đích (nháp)
          <select
            value={selectedPaperId}
            onChange={(event) => setSelectedPaperId(event.target.value)}
          >
            {papers.length === 0 ? <option value="">Chưa có đề nháp</option> : null}
            {papers.map((paper) => (
              <option key={paper.id} value={paper.id}>
                {paper.roomName} · {paper.label} ({paper.subjectCode})
              </option>
            ))}
          </select>
        </label>
        <Link href="/admin" className={styles.ghostButton}>
          <ArrowLeft size={16} /> Admin
        </Link>
      </header>

      {error ? (
        <p className={styles.alertError}>
          <AlertCircle size={15} /> {error}
        </p>
      ) : null}
      {feedback ? (
        <p className={styles.alertOk}>
          <CheckCircle2 size={15} /> {feedback}
        </p>
      ) : null}

      {papers.length === 0 ? (
        <div className={styles.empty}>
          Chưa có <strong>đề nháp</strong> nào để dựng. Hãy tạo một đề nháp trong
          trang <Link href="/admin/authoring">Soạn đề</Link> (chế độ &ldquo;Cả
          đề&rdquo;) hoặc ở phần quản lý phòng thi, rồi quay lại đây.
        </div>
      ) : (
        <div className={styles.grid}>
          {/* Ngân hàng câu hỏi */}
          <section className={styles.panel}>
            <div className={styles.panelHead}>
              <h2>Ngân hàng câu hỏi</h2>
              <span>{subjectCode || '—'}</span>
            </div>

            <div className={styles.filters}>
              <div className={styles.searchRow}>
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') runSearch(subjectCode);
                  }}
                  placeholder="Tìm trong nội dung câu hỏi..."
                />
                <button
                  type="button"
                  onClick={() => runSearch(subjectCode)}
                  disabled={searching || !subjectCode}
                >
                  <Search size={15} /> Tìm
                </button>
              </div>
              <div className={styles.filterRow}>
                <select
                  value={typeFilter}
                  onChange={(event) => setTypeFilter(event.target.value)}
                >
                  <option value="">Mọi dạng</option>
                  <option value="multiple_choice">Trắc nghiệm</option>
                  <option value="true_false">Đúng/Sai</option>
                  <option value="short_answer">Trả lời ngắn</option>
                  <option value="essay">Tự luận</option>
                </select>
                <select
                  value={difficultyFilter}
                  onChange={(event) => setDifficultyFilter(event.target.value)}
                >
                  <option value="">Mọi độ khó</option>
                  <option value="1">Nhận biết</option>
                  <option value="2">Thông hiểu</option>
                  <option value="3">Vận dụng</option>
                  <option value="4">Vận dụng cao</option>
                </select>
                <select
                  value={knowledgeFilter}
                  onChange={(event) => setKnowledgeFilter(event.target.value)}
                >
                  <option value="">Mọi chuyên đề</option>
                  {subjectKnowledge.map((field) => (
                    <option key={field.id} value={field.id}>
                      {field.grade ? `L${field.grade}· ` : ''}
                      {field.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className={styles.bankList}>
              {searching ? (
                <p className={styles.muted}>Đang tìm...</p>
              ) : bank.length === 0 ? (
                <p className={styles.muted}>Không có câu nào khớp.</p>
              ) : (
                bank.map((question) => {
                  const placed = placedIds.has(question.id);
                  const checked = selectedIds.has(question.id);
                  return (
                    <label
                      key={question.id}
                      className={`${styles.bankItem} ${placed ? styles.bankItemPlaced : ''}`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={placed}
                        onChange={() => toggleSelect(question.id)}
                      />
                      <div className={styles.bankBody}>
                        <div className={styles.bankMeta}>
                          <span className={styles.tag}>
                            {typeLabels[question.type] ?? question.type}
                          </span>
                          <span className={styles.tagSoft}>
                            {difficultyLabels[question.difficulty] ??
                              `Mức ${question.difficulty}`}
                          </span>
                          {question.code ? (
                            <code>{question.code}</code>
                          ) : null}
                          {placed ? (
                            <span className={styles.placedFlag}>đã có trong đề</span>
                          ) : null}
                        </div>
                        <p>{truncate(question.content)}</p>
                      </div>
                    </label>
                  );
                })
              )}
            </div>

            <div className={styles.addBar}>
              <span>{selectedIds.size} câu đang chọn</span>
              <button
                type="button"
                className={styles.primaryButton}
                onClick={handleAdd}
                disabled={busy || selectedIds.size === 0}
              >
                <Plus size={16} /> Thêm vào đề
              </button>
            </div>
          </section>

          {/* Bố cục đề */}
          <section className={styles.panel}>
            <div className={styles.panelHead}>
              <h2>Bố cục đề</h2>
              <span>{totalPlaced} câu</span>
            </div>

            <div className={styles.compositionList}>
              {(composition?.sections ?? []).length === 0 ? (
                <p className={styles.muted}>
                  Blueprint của đề chưa có phần nào, hoặc chưa nạp được bố cục.
                </p>
              ) : (
                composition!.sections.map((section) => (
                  <div key={section.sectionId} className={styles.section}>
                    <div className={styles.sectionHead}>
                      <strong>
                        {section.sectionCode} · {section.title}
                      </strong>
                      <span
                        className={
                          section.placedCount >= section.displayedCount
                            ? styles.countFull
                            : styles.count
                        }
                      >
                        {section.placedCount}/{section.displayedCount}
                      </span>
                    </div>
                    <span className={styles.sectionType}>
                      {typeLabels[section.type] ?? section.type}
                    </span>
                    {section.questions.length === 0 ? (
                      <p className={styles.mutedSmall}>Chưa có câu nào.</p>
                    ) : (
                      <ol className={styles.placedList}>
                        {section.questions.map((question) => (
                          <li key={question.questionId}>
                            <span className={styles.placedContent}>
                              {question.code ? (
                                <code>{question.code}</code>
                              ) : null}{' '}
                              {truncate(question.content, 110)}
                            </span>
                            <button
                              type="button"
                              className={styles.removeButton}
                              onClick={() => handleRemove(question.questionId)}
                              disabled={busy}
                              title="Gỡ khỏi đề"
                            >
                              <Trash2 size={14} />
                            </button>
                          </li>
                        ))}
                      </ol>
                    )}
                  </div>
                ))
              )}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
