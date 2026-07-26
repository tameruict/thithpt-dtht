// [C] Adapter: JSON theo câu -> DSL LaTeX mà parseAuthoringSource hiểu.
//
// Sinh ra khối \begin{question}[...] ... \end{question} (bọc \begin{exam} khi có
// nhiều câu). Cú pháp phải khớp parser.ts:
//   - choice:    \begin{choice}[correct,label=A] ... \end{choice}
//   - statement: \begin{statement}[correct=true,label=a] ... \end{statement}
//   - short:     \answer{...}
//   - ảnh:       \image[alt={...}]{url}  (chỉ nhúng khi đã có url R2)
//
// Phần upload ảnh (path local -> url R2) NẰM NGOÀI module này (cần credentials
// R2). Adapter chỉ nhúng ảnh nào đã có url.

import type { ExamQuestionType } from '@/lib/supabase/exam-data';
import { resolveQuestionType } from './importSchema';
import type {
  ImportDocument,
  ImportImage,
  ImportOption,
  ImportQuestion,
  ImportRubricItem,
  ImportStatement,
} from './importSchema';

function optionLabel(option: ImportOption, index: number): string {
  return (option.label ?? String.fromCharCode(65 + index)).trim().toUpperCase();
}

function statementLabel(item: ImportStatement, index: number): string {
  return (item.label ?? String.fromCharCode(97 + index)).trim();
}

function imageMacro(image: ImportImage): string {
  return `\\image[alt={${image.alt}}]{${image.url}}`;
}

function rubricBlock(item: ImportRubricItem): string {
  const title = (item.title ?? '').trim();
  const description = (item.description ?? '').toString().trim();
  const lines = [`\\begin{rubric}[title={${title}},points=${item.points}]`];
  if (description) lines.push(description);
  lines.push('\\end{rubric}');
  return lines.join('\n');
}

function imagesFor(question: ImportQuestion, target: string): ImportImage[] {
  return (question.images ?? []).filter(
    (image) =>
      (image.target ?? 'question') === target &&
      typeof image.url === 'string' &&
      image.url.trim() !== '',
  );
}

function buildQuestionAttributes(question: ImportQuestion, type: ExamQuestionType): string {
  const parts = [`type=${type}`, `difficulty=${question.difficulty ?? 2}`];

  const section = (question.section ?? question.part ?? '').toString().trim();
  if (section) parts.push(`section={${section}}`);

  const knowledge = question.knowledgeFieldSlug?.trim();
  if (knowledge) parts.push(`knowledge=${knowledge}`);

  const code = question.code?.trim();
  if (code) parts.push(`code={${code}}`);

  return parts.join(',');
}

export function buildQuestionDsl(question: ImportQuestion): string {
  const type = resolveQuestionType(question);
  if (!type) {
    throw new Error('Không xác định được question_type (thiếu type và part).');
  }

  const lines: string[] = [];
  lines.push(`\\begin{question}[${buildQuestionAttributes(question, type)}]`);

  const content = (question.content ?? '').trim();
  if (content) lines.push(content);

  for (const image of imagesFor(question, 'question')) {
    lines.push(imageMacro(image));
  }

  if (type === 'multiple_choice') {
    (question.options ?? []).forEach((option, index) => {
      const label = optionLabel(option, index);
      const attrs = option.correct ? `correct,label=${label}` : `label=${label}`;
      lines.push('');
      lines.push(`\\begin{choice}[${attrs}]`);
      const optionContent = (option.content ?? '').trim();
      if (optionContent) lines.push(optionContent);
      for (const image of imagesFor(question, `option${label}`)) {
        lines.push(imageMacro(image));
      }
      lines.push('\\end{choice}');
    });
  }

  if (type === 'true_false') {
    (question.trueFalseItems ?? []).forEach((item, index) => {
      const label = statementLabel(item, index);
      lines.push('');
      lines.push(`\\begin{statement}[correct=${item.correct ? 'true' : 'false'},label=${label}]`);
      const itemContent = (item.content ?? '').trim();
      if (itemContent) lines.push(itemContent);
      lines.push('\\end{statement}');
    });
  }

  if (type === 'short_answer') {
    const answer = question.answer;
    const answerText =
      typeof answer === 'number' ? String(answer) : (answer ?? '').toString().trim();
    if (answerText) {
      lines.push('');
      lines.push(`\\answer{${answerText}}`);
    }
  }

  for (const item of question.rubric ?? []) {
    lines.push('');
    lines.push(rubricBlock(item));
  }

  const explanation = question.explanation?.trim();
  if (explanation) {
    lines.push('');
    lines.push(`\\explanation{${explanation}}`);
  }

  lines.push('\\end{question}');
  return lines.join('\n');
}

export function buildAuthoringDsl(
  document: ImportDocument,
  options: { wrap?: boolean } = {},
): string {
  const blocks = document.questions.map((question) => buildQuestionDsl(question));
  const body = blocks.join('\n\n');
  const wrap = options.wrap ?? document.questions.length > 1;
  return wrap ? `\\begin{exam}\n${body}\n\\end{exam}` : body;
}
