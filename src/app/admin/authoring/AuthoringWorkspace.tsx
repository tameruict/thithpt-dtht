'use client';

import Link from 'next/link';
import {
  AlertCircle,
  ArrowLeft,
  BookOpen,
  Check,
  ChevronDown,
  FileJson,
  FilePlus2,
  ImagePlus,
  Layers,
  ListPlus,
  PanelLeftClose,
  PenLine,
  Plus,
  Send,
  ShieldCheck,
  Sparkles,
  UploadCloud,
  X,
} from 'lucide-react';
import {
  FormEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from 'react';
import {
  getQuestionMetadataAtPosition,
  getQuestionRangeAtPosition,
  parseAuthoringSource,
} from '@/lib/authoring/parser';
import { getAuthoringTemplate } from '@/lib/authoring/templates';
import type {
  AuthoringDocument,
  AuthoringKnowledgeField,
  AuthoringMode,
  AuthoringQuestion,
  AuthoringWorkspaceData,
} from '@/lib/authoring/types';
import QuestionFormModal from './QuestionFormModal';
import ImportModal from './ImportModal';
import QuestionRenderer, {
  MathText,
  type RenderableQuestion,
} from '@/components/question/QuestionRenderer';
import {
  createAuthoringDocument,
  createKnowledgeField,
  publishAuthoringDocument,
  saveAuthoringDocument,
  uploadAuthoringImage,
} from './actions';
import LatexEditor, { type LatexEditorHandle } from './LatexEditor';
import { HANOI_TZ } from '@/lib/datetime';
import styles from '@/styles/authoring.module.css';

type Props = {
  initialData: AuthoringWorkspaceData;
};

const difficultyOptions = [
  { value: 1, label: 'Nhận biết' },
  { value: 2, label: 'Thông hiểu' },
  { value: 3, label: 'Vận dụng' },
  { value: 4, label: 'Vận dụng cao' },
];

function formatTime(value: string) {
  return new Intl.DateTimeFormat('vi-VN', {
    timeZone: HANOI_TZ,
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit',
  }).format(new Date(value));
}

function knowledgeFieldLabel(
  field: AuthoringKnowledgeField,
  fields: AuthoringKnowledgeField[],
) {
  const names = [field.name];
  let parentId = field.parentId;
  const visited = new Set<number>([field.id]);

  while (parentId !== null && !visited.has(parentId)) {
    const parent = fields.find((candidate) => candidate.id === parentId);
    if (!parent) break;
    visited.add(parent.id);
    names.unshift(parent.name);
    parentId = parent.parentId;
  }

  return `${field.grade ? `Lớp ${field.grade} · ` : ''}${names.join(' / ')}`;
}

function toRenderableQuestion(
  question: ReturnType<typeof parseAuthoringSource>['questions'][number],
  index: number,
): RenderableQuestion {
  return {
    id: `preview-${index}`,
    displayNo: String(index + 1),
    type: question.type,
    content: question.content,
    imageUrl: question.image?.url ?? null,
    imageAltText: question.image?.alt ?? null,
    options: question.options.map((option, optionIndex) => ({
      id: `preview-${index}-option-${optionIndex}`,
      label: option.label,
      content: option.content,
      imageUrl: option.image?.url ?? null,
      imageAltText: option.image?.alt ?? null,
      correct: option.correct,
    })),
    trueFalseItems: question.trueFalseItems.map((item, itemIndex) => ({
      id: `preview-${index}-tf-${itemIndex}`,
      label: item.label,
      content: item.content,
      correct: item.correct,
    })),
  };
}

export default function AuthoringWorkspace({ initialData }: Props) {
  const [documents, setDocuments] = useState(initialData.documents);
  const [knowledgeFields, setKnowledgeFields] = useState(
    initialData.knowledgeFields,
  );
  const [papers, setPapers] = useState(initialData.papers);
  const [selectedId, setSelectedId] = useState(initialData.documents[0]?.id ?? '');
  const [source, setSource] = useState(initialData.documents[0]?.latexSource ?? '');
  const [savedSource, setSavedSource] = useState(source);
  const [revision, setRevision] = useState(initialData.documents[0]?.revision ?? 1);
  const [feedback, setFeedback] = useState('');
  const [mobilePane, setMobilePane] = useState<'editor' | 'preview'>('editor');
  const [showCreate, setShowCreate] = useState(initialData.documents.length === 0);
  const [showImage, setShowImage] = useState(false);
  const [imageUploading, setImageUploading] = useState(false);
  const [imageError, setImageError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [formInitial, setFormInitial] = useState<AuthoringQuestion | null>(null);
  const [formTarget, setFormTarget] = useState<{ start: number; end: number } | null>(
    null,
  );
  const [showKnowledgeCreate, setShowKnowledgeCreate] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [cursorPosition, setCursorPosition] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [isPending, startTransition] = useTransition();
  const editorRef = useRef<LatexEditorHandle>(null);

  const selectedDocument = useMemo(
    () => documents.find((document) => document.id === selectedId) ?? null,
    [documents, selectedId],
  );
  const mode = selectedDocument?.mode ?? 'question';
  const parsed = useMemo(
    () => parseAuthoringSource(source, mode),
    [mode, source],
  );
  const activeQuestionMetadata = useMemo(
    () => getQuestionMetadataAtPosition(source, cursorPosition),
    [cursorPosition, source],
  );
  const activeQuestion =
    activeQuestionMetadata === null
      ? null
      : parsed.questions[activeQuestionMetadata.index] ?? null;
  const subjectKnowledgeFields = useMemo(
    () =>
      knowledgeFields
        .filter(
          (field) => field.subjectCode === selectedDocument?.subjectCode,
        )
        .sort((left, right) =>
          knowledgeFieldLabel(left, knowledgeFields).localeCompare(
            knowledgeFieldLabel(right, knowledgeFields),
            'vi',
          ),
        ),
    [knowledgeFields, selectedDocument?.subjectCode],
  );
  const dirty = Boolean(selectedDocument && source !== savedSource);
  const publishedCurrent =
    selectedDocument?.publishedRevision === revision && !dirty;

  useEffect(() => {
    if (!selectedDocument || !dirty || isSaving || publishedCurrent) return;

    const timeout = window.setTimeout(async () => {
      setIsSaving(true);
      const sourceToSave = source;
      const result = await saveAuthoringDocument({
        documentId: selectedDocument.id,
        expectedRevision: revision,
        latexSource: sourceToSave,
      });

      if (result.ok) {
        setRevision(result.revision);
        setSavedSource(sourceToSave);
        setDocuments((current) =>
          current.map((document) =>
            document.id === selectedDocument.id
              ? {
                  ...document,
                  latexSource: sourceToSave,
                  revision: result.revision,
                  updatedAt: result.updatedAt,
                }
              : document,
          ),
        );
        setFeedback('');
      } else {
        setFeedback(result.error);
      }
      setIsSaving(false);
    }, 900);

    return () => window.clearTimeout(timeout);
  }, [dirty, isSaving, publishedCurrent, revision, selectedDocument, source]);

  const registerCreatedDocument = (
    document: AuthoringDocument,
    sourcePaperId: string,
  ) => {
    setDocuments((current) => [
      document,
      ...current.filter((existing) => existing.id !== document.id),
    ]);
    if (
      document.paperId &&
      !papers.some((paper) => paper.id === document.paperId)
    ) {
      const sourcePaper = papers.find((paper) => paper.id === sourcePaperId);
      if (sourcePaper) {
        setPapers((current) => [
          {
            ...sourcePaper,
            id: document.paperId!,
            label: `${sourcePaper.label} - draft`,
            status: 'draft',
            isDefault: false,
          },
          ...current,
        ]);
      }
    }
    setSelectedId(document.id);
    setSource(document.latexSource);
    setSavedSource(document.latexSource);
    setRevision(document.revision);
  };

  const handleCreate = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const nextMode = String(form.get('mode')) as AuthoringMode;
    const subjectCode = String(form.get('subjectCode'));
    const sourcePaperId = String(form.get('sourcePaperId') || '');
    const title = String(form.get('title') || '');

    startTransition(async () => {
      const result = await createAuthoringDocument({
        mode: nextMode,
        title,
        subjectCode,
        sourcePaperId: nextMode === 'paper' ? sourcePaperId : null,
      });
      if (!result.ok) {
        setFeedback(result.error);
        return;
      }
      registerCreatedDocument(result.document, sourcePaperId);
      setShowCreate(false);
      setFeedback('');
    });
  };

  const handlePublish = () => {
    if (!selectedDocument || dirty || isSaving || parsed.errors.length > 0) return;

    startTransition(async () => {
      const result = await publishAuthoringDocument({
        documentId: selectedDocument.id,
        expectedRevision: revision,
        latexSource: source,
      });
      if (!result.ok) {
        setFeedback(result.error);
        return;
      }
      setFeedback('Xuất bản thành công. Dữ liệu câu hỏi đã được ghi atomically.');
      setDocuments((current) =>
        current.map((document) =>
          document.id === selectedDocument.id
            ? {
                ...document,
                publishedRevision: revision,
                publishedAt: new Date().toISOString(),
              }
            : document,
        ),
      );
    });
  };

  const openImageModal = () => {
    setImageError('');
    setShowImage(true);
  };

  const handleInsertImage = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const url = String(form.get('url') || '').trim();
    const alt = String(form.get('alt') || '').trim().replace(/[{}]/g, '');
    if (!url || !alt) return;
    editorRef.current?.insertText(`\\image[alt={${alt}}]{${url}}`);
    setShowImage(false);
  };

  const handleUploadImage = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const file = formData.get('file');
    const alt = String(formData.get('alt') || '').trim().replace(/[{}]/g, '');

    if (!(file instanceof File) || file.size === 0) {
      setImageError('Hãy chọn một tệp ảnh.');
      return;
    }
    if (!alt) {
      setImageError('Hãy nhập alt text mô tả ảnh.');
      return;
    }

    setImageError('');
    setImageUploading(true);
    try {
      const result = await uploadAuthoringImage(formData);
      if (!result.ok) {
        setImageError(result.error);
        return;
      }
      editorRef.current?.insertText(
        `\\image[alt={${result.alt || alt}}]{${result.url}}`,
      );
      setShowImage(false);
    } finally {
      setImageUploading(false);
    }
  };

  const handleCreateKnowledgeField = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedDocument) return;
    const form = new FormData(event.currentTarget);
    const gradeValue = String(form.get('grade') || '');
    const parentValue = String(form.get('parentId') || '');

    startTransition(async () => {
      const result = await createKnowledgeField({
        subjectCode: selectedDocument.subjectCode,
        name: String(form.get('name') || ''),
        grade: gradeValue ? Number(gradeValue) : null,
        parentId: parentValue ? Number(parentValue) : null,
      });
      if (!result.ok) {
        setFeedback(result.error);
        return;
      }

      setKnowledgeFields((current) => [
        ...current,
        result.knowledgeField,
      ]);
      editorRef.current?.updateQuestionMetadata({
        knowledgeFieldSlug: result.knowledgeField.slug,
      });
      setShowKnowledgeCreate(false);
      setFeedback('');
    });
  };

  const updateActiveQuestionMetadata = (updates: {
    difficulty?: number;
    knowledgeFieldSlug?: string | null;
  }) => {
    if (publishedCurrent) return;
    if (!editorRef.current?.updateQuestionMetadata(updates)) {
      setFeedback('Đặt con trỏ bên trong câu hỏi cần phân loại.');
      return;
    }
    setFeedback('');
  };

  const insertSnippet = (snippet: string) => {
    editorRef.current?.insertText(snippet);
  };

  const openCreateForm = () => {
    setFormInitial(null);
    setFormTarget(null);
    setShowForm(true);
  };

  const openEditForm = () => {
    const range = getQuestionRangeAtPosition(source, cursorPosition);
    if (!range) {
      setFeedback('Đặt con trỏ vào trong câu hỏi cần sửa bằng form.');
      return;
    }
    const single = parseAuthoringSource(
      source.slice(range.start, range.end),
      'question',
    );
    const question = single.questions[0] ?? null;
    if (!question) {
      setFeedback('Không đọc được câu tại con trỏ (cú pháp chưa hợp lệ).');
      return;
    }
    setFormInitial(question);
    setFormTarget({ start: range.start, end: range.end });
    setShowForm(true);
  };

  const handleFormSubmit = (dsl: string) => {
    if (formTarget) {
      editorRef.current?.replaceRange(formTarget.start, formTarget.end, dsl);
    } else {
      editorRef.current?.insertText(`${dsl}\n\n`);
    }
    setShowForm(false);
    setFeedback('');
  };

  const handleImportCreated = (
    document: AuthoringDocument,
    sourcePaperId: string,
  ) => {
    registerCreatedDocument(document, sourcePaperId);
    setShowImport(false);
    setFeedback('Đã tạo bản nháp từ JSON. Xem preview bên phải rồi bấm Xuất bản.');
  };

  const selectDocument = (documentId: string) => {
    const nextDocument = documents.find((document) => document.id === documentId);
    if (!nextDocument) return;
    setSelectedId(nextDocument.id);
    setSource(nextDocument.latexSource);
    setSavedSource(nextDocument.latexSource);
    setRevision(nextDocument.revision);
    setFeedback('');
  };

  return (
    <div className={styles.shell}>
      <header className={styles.topbar}>
        <div className={styles.brand}>
          <span><ShieldCheck size={18} /></span>
          <div>
            <strong>THPT Authoring</strong>
            <small>LaTeX workspace</small>
          </div>
        </div>
        <div className={styles.documentTitle}>
          <strong>{selectedDocument?.title ?? 'Chưa có bản nháp'}</strong>
          <span>
            {isSaving ? 'Đang lưu...' : dirty ? 'Chờ autosave' : 'Đã lưu'}
          </span>
        </div>
        <div className={styles.topActions}>
          <Link href="/admin/compose" className={styles.ghostButton}>
            <Layers size={16} /> Dựng đề
          </Link>
          <Link href="/admin" transitionTypes={['nav-back']} className={styles.ghostButton}>
            <ArrowLeft size={16} /> Admin
          </Link>
          <button
            type="button"
            className={styles.publishButton}
            disabled={
              !selectedDocument ||
              dirty ||
              isSaving ||
              isPending ||
              publishedCurrent ||
              parsed.errors.length > 0
            }
            onClick={handlePublish}
          >
            <Send size={16} />
            Xuất bản
          </button>
        </div>
      </header>

      <aside className={styles.documentRail}>
        <button
          type="button"
          className={styles.newDocument}
          onClick={() => setShowCreate(true)}
        >
          <FilePlus2 size={17} /> Bản nháp mới
        </button>
        <button
          type="button"
          className={styles.importDocument}
          onClick={() => setShowImport(true)}
        >
          <FileJson size={16} /> Nạp đề (JSON)
        </button>
        <div className={styles.railLabel}>Tài liệu gần đây</div>
        <div className={styles.documentList}>
          {documents.map((document) => (
            <button
              type="button"
              key={document.id}
              className={`${styles.documentItem} ${
                document.id === selectedId ? styles.activeDocument : ''
              }`}
              onClick={() => selectDocument(document.id)}
            >
              <span className={styles.documentIcon}>
                {document.mode === 'paper' ? 'Đ' : 'C'}
              </span>
              <span>
                <strong>{document.title}</strong>
                <small>
                  {document.subjectCode} · {formatTime(document.updatedAt)}
                </small>
              </span>
            </button>
          ))}
        </div>
        <div className={styles.syntaxHelp}>
          <Sparkles size={16} />
          <strong>Cú pháp ảnh R2</strong>
          <code>{'\\image[alt={Mô tả}]{https://...}'}</code>
        </div>
      </aside>

      <main className={styles.workspace}>
        <div className={styles.workspaceToolbar}>
          <div className={styles.toolbarActions}>
            <div className={styles.modeBadge}>
              {mode === 'paper' ? 'Cả đề' : 'Từng câu'}
              <ChevronDown size={14} />
            </div>
            <button
              type="button"
              className={styles.formButton}
              disabled={publishedCurrent}
              onClick={openCreateForm}
            >
              <ListPlus size={16} /> Thêm câu (form)
            </button>
            <button
              type="button"
              disabled={publishedCurrent}
              onClick={openEditForm}
            >
              <PenLine size={16} /> Sửa câu (form)
            </button>
            <button
              type="button"
              disabled={publishedCurrent}
              onClick={openImageModal}
            >
              <ImagePlus size={16} /> Chèn ảnh R2
            </button>
            <button
              type="button"
              disabled={publishedCurrent}
              onClick={() =>
                insertSnippet(
                  String.raw`\begin{choice}[label=A]
Nội dung lựa chọn
\end{choice}`,
                )
              }
            >
              <Plus size={15} /> Choice
            </button>
            {publishedCurrent ? (
              <button type="button" onClick={() => setShowCreate(true)}>
                <FilePlus2 size={15} /> Draft kế nhiệm
              </button>
            ) : null}
            <button
              type="button"
              disabled={publishedCurrent}
              onClick={() => insertSnippet(String.raw`$x^2 + y^2$`)}
            >
              Công thức
            </button>
            <button
              type="button"
              className={styles.resetButton}
              disabled={publishedCurrent}
              onClick={() => setSource(getAuthoringTemplate(mode))}
            >
              Mẫu mặc định
            </button>
          </div>

          <div className={styles.metadataBar}>
            <div className={styles.activeQuestionLabel}>
              <BookOpen size={15} />
              {activeQuestionMetadata
                ? `Câu ${activeQuestionMetadata.index + 1} đang soạn`
                : 'Đặt con trỏ trong một câu hỏi'}
            </div>
            <label className={styles.metadataField}>
              <span>Môn học</span>
              <select
                value={selectedDocument?.subjectCode ?? ''}
                disabled
                aria-label="Môn học của tài liệu"
              >
                {initialData.subjects.map((subject) => (
                  <option key={subject.code} value={subject.code}>
                    {subject.name}
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.metadataField}>
              <span>Mức độ</span>
              <select
                value={activeQuestion?.difficulty ?? 2}
                disabled={!activeQuestion || publishedCurrent}
                onChange={(event) =>
                  updateActiveQuestionMetadata({
                    difficulty: Number(event.target.value),
                  })
                }
              >
                {difficultyOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className={`${styles.metadataField} ${styles.knowledgeField}`}>
              <span>Phạm vi kiến thức</span>
              <select
                value={activeQuestion?.knowledgeFieldSlug ?? ''}
                disabled={!activeQuestion || publishedCurrent}
                onChange={(event) =>
                  updateActiveQuestionMetadata({
                    knowledgeFieldSlug: event.target.value || null,
                  })
                }
              >
                <option value="">Chưa phân loại</option>
                {subjectKnowledgeFields.map((field) => (
                  <option key={field.id} value={field.slug}>
                    {knowledgeFieldLabel(field, knowledgeFields)}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className={styles.addKnowledgeButton}
              disabled={!activeQuestion || publishedCurrent}
              onClick={() => setShowKnowledgeCreate(true)}
            >
              <Plus size={15} /> Thêm kiến thức
            </button>
          </div>
        </div>

        <div className={styles.mobileTabs}>
          <button
            type="button"
            className={mobilePane === 'editor' ? styles.activeMobileTab : ''}
            onClick={() => setMobilePane('editor')}
          >
            Soạn thảo
          </button>
          <button
            type="button"
            className={mobilePane === 'preview' ? styles.activeMobileTab : ''}
            onClick={() => setMobilePane('preview')}
          >
            Xem trước
          </button>
        </div>

        <div className={styles.splitPane}>
          <section
            className={`${styles.editorPane} ${
              mobilePane !== 'editor' ? styles.mobileHidden : ''
            }`}
          >
            {selectedDocument ? (
              <LatexEditor
                ref={editorRef}
                value={source}
                onChange={setSource}
                onCursorChange={setCursorPosition}
                readOnly={publishedCurrent}
              />
            ) : (
              <div className={styles.emptyWorkspace}>
                <PanelLeftClose size={28} />
                <p>Tạo bản nháp để bắt đầu soạn đề.</p>
              </div>
            )}
          </section>

          <section
            className={`${styles.previewPane} ${
              mobilePane !== 'preview' ? styles.mobileHidden : ''
            }`}
          >
            <div className={styles.previewHeader}>
              <div>
                <span>Xem trước trực tiếp</span>
                <strong>
                  {parsed.questions.length} câu · {parsed.errors.length} lỗi
                </strong>
              </div>
              {parsed.errors.length === 0 ? (
                <span className={styles.validState}><Check size={14} /> Hợp lệ</span>
              ) : (
                <span className={styles.errorState}>
                  <AlertCircle size={14} /> Cần sửa
                </span>
              )}
            </div>

            {parsed.errors.length > 0 ? (
              <div className={styles.errorList}>
                {parsed.errors.slice(0, 8).map((error, index) => (
                  <button
                    type="button"
                    key={`${error.line}-${error.column}-${index}`}
                    onClick={() => {
                      setMobilePane('editor');
                      editorRef.current?.goTo(error.line, error.column);
                    }}
                  >
                    <strong>Dòng {error.line}:{error.column}</strong>
                    <span>{error.message}</span>
                  </button>
                ))}
              </div>
            ) : null}

            <div className={styles.paper}>
              {parsed.questions.length === 0 ? (
                <div className={styles.previewEmpty}>
                  Preview sẽ xuất hiện khi nguồn có môi trường question.
                </div>
              ) : null}
              {parsed.questions.map((question, index) => (
                <article key={index} className={styles.previewQuestion}>
                  <QuestionRenderer
                    question={toRenderableQuestion(question, index)}
                    showSolutions
                  />
                  {question.explanation ? (
                    <div className={styles.explanation}>
                      <strong>Lời giải:</strong>{' '}
                      <MathText value={question.explanation} />
                    </div>
                  ) : null}
                </article>
              ))}
            </div>
          </section>
        </div>

        {feedback ? <div className={styles.feedback}>{feedback}</div> : null}
      </main>

      {showCreate ? (
        <div className={styles.modalBackdrop}>
          <form className={styles.modal} onSubmit={handleCreate}>
            <div className={styles.modalHeader}>
              <div>
                <span>Bản nháp mới</span>
                <h2>Chọn phạm vi soạn đề</h2>
              </div>
              {documents.length > 0 ? (
                <button type="button" onClick={() => setShowCreate(false)}>
                  <X size={18} />
                </button>
              ) : null}
            </div>
            <label>
              Tên tài liệu
              <input name="title" placeholder="Ví dụ: Đề luyện tập Toán số 01" required />
            </label>
            <div className={styles.modeChoices}>
              <label>
                <input type="radio" name="mode" value="question" defaultChecked />
                <span><strong>Từng câu</strong><small>Soạn và xuất bản một câu vào ngân hàng.</small></span>
              </label>
              <label>
                <input type="radio" name="mode" value="paper" />
                <span><strong>Cả đề</strong><small>Tạo draft kế nhiệm cho một paper hiện có.</small></span>
              </label>
            </div>
            <label>
              Môn học
              <select name="subjectCode" required>
                {initialData.subjects.map((subject) => (
                  <option key={subject.code} value={subject.code}>
                    {subject.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Paper đích (chỉ dùng khi chọn Cả đề)
              <select name="sourcePaperId">
                <option value="">Chọn paper...</option>
                {papers.map((paper) => (
                  <option key={paper.id} value={paper.id}>
                    {paper.roomName} · {paper.label} · {paper.subjectCode}
                  </option>
                ))}
              </select>
            </label>
            <button className={styles.primaryModalButton} disabled={isPending}>
              <FilePlus2 size={16} />
              {isPending ? 'Đang tạo...' : 'Tạo workspace'}
            </button>
          </form>
        </div>
      ) : null}

      {showForm ? (
        <QuestionFormModal
          initial={formInitial}
          knowledgeFields={subjectKnowledgeFields}
          onClose={() => setShowForm(false)}
          onSubmit={handleFormSubmit}
        />
      ) : null}

      {showImport ? (
        <ImportModal
          subjects={initialData.subjects}
          papers={papers}
          onClose={() => setShowImport(false)}
          onCreated={handleImportCreated}
        />
      ) : null}

      {showImage ? (
        <div className={styles.modalBackdrop}>
          <div className={styles.modal}>
            <div className={styles.modalHeader}>
              <div>
                <span>Cloudflare R2</span>
                <h2>Chèn ảnh vào câu hỏi</h2>
              </div>
              <button type="button" onClick={() => setShowImage(false)}>
                <X size={18} />
              </button>
            </div>

            {imageError ? (
              <p className={styles.modalError}>
                <AlertCircle size={15} /> {imageError}
              </p>
            ) : null}

            <form onSubmit={handleUploadImage}>
              <label>
                Tải tệp ảnh lên (PNG, JPG, WEBP, AVIF · ≤ 10 MB)
                <input
                  name="file"
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/avif"
                  required
                />
              </label>
              <label>
                Alt text
                <input
                  name="alt"
                  required
                  placeholder="Mô tả nội dung ảnh cho trình đọc màn hình"
                />
              </label>
              <button
                className={styles.primaryModalButton}
                disabled={imageUploading}
              >
                <UploadCloud size={16} />
                {imageUploading ? 'Đang tải lên...' : 'Tải lên & chèn'}
              </button>
            </form>

            <div className={styles.modalDivider}>hoặc dán URL đã có trong registry</div>

            <form onSubmit={handleInsertImage}>
              <label>
                Public URL
                <input
                  name="url"
                  type="url"
                  required
                  placeholder="https://cdn.example.com/path/image.webp"
                />
              </label>
              <label>
                Alt text
                <input
                  name="alt"
                  required
                  placeholder="Mô tả nội dung ảnh cho trình đọc màn hình"
                />
              </label>
              <p className={styles.modalHint}>
                URL phải khớp chính xác một bản ghi trong r2_assets. Signed URL và HTTP sẽ bị từ chối khi xuất bản.
              </p>
              <button className={styles.primaryModalButton}>
                <ImagePlus size={16} /> Chèn tại con trỏ
              </button>
            </form>
          </div>
        </div>
      ) : null}

      {showKnowledgeCreate && selectedDocument ? (
        <div className={styles.modalBackdrop}>
          <form className={styles.modal} onSubmit={handleCreateKnowledgeField}>
            <div className={styles.modalHeader}>
              <div>
                <span>{selectedDocument.subjectCode}</span>
                <h2>Thêm phạm vi kiến thức</h2>
              </div>
              <button
                type="button"
                onClick={() => setShowKnowledgeCreate(false)}
              >
                <X size={18} />
              </button>
            </div>
            <label>
              Tên kiến thức
              <input
                name="name"
                required
                autoFocus
                placeholder="Ví dụ: Đạo hàm và ứng dụng"
              />
            </label>
            <label>
              Khối lớp
              <select name="grade" defaultValue="">
                <option value="">Dùng chung nhiều khối</option>
                <option value="10">Lớp 10</option>
                <option value="11">Lớp 11</option>
                <option value="12">Lớp 12</option>
              </select>
            </label>
            <label>
              Phạm vi cha
              <select name="parentId" defaultValue="">
                <option value="">Không có</option>
                {subjectKnowledgeFields.map((field) => (
                  <option key={field.id} value={field.id}>
                    {knowledgeFieldLabel(field, knowledgeFields)}
                  </option>
                ))}
              </select>
            </label>
            <p className={styles.modalHint}>
              Phạm vi mới được lưu trực tiếp vào cơ sở dữ liệu và tự động gán
              cho câu đang đặt con trỏ.
            </p>
            <button className={styles.primaryModalButton} disabled={isPending}>
              <Plus size={16} />
              {isPending ? 'Đang thêm...' : 'Thêm và chọn'}
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}
