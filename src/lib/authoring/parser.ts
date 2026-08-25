import { parse as parseLatexAst } from '@unified-latex/unified-latex-util-parse';
import type { ExamQuestionType } from '@/lib/supabase/exam-data';
import { validateMathContent } from '@/lib/math-content';
import type {
  AuthoringImage,
  AuthoringMode,
  AuthoringParseError,
  AuthoringParseResult,
  AuthoringQuestion,
} from './types';

type EnvironmentBlock = {
  name: string;
  attributes: string;
  body: string;
  raw: string;
  start: number;
  end: number;
  attributesStart: number;
  bodyStart: number;
};

export type QuestionMetadataAtPosition = {
  index: number;
  difficulty: number;
  knowledgeFieldSlug: string | null;
};

const supportedQuestionTypes = new Set<ExamQuestionType>([
  'multiple_choice',
  'true_false',
  'short_answer',
  'essay',
]);

function positionAt(source: string, index: number) {
  const before = source.slice(0, index);
  const lines = before.split('\n');
  return {
    line: lines.length,
    column: (lines.at(-1)?.length ?? 0) + 1,
  };
}

function addError(
  errors: AuthoringParseError[],
  source: string,
  index: number,
  message: string,
) {
  errors.push({ message, ...positionAt(source, Math.max(index, 0)) });
}

function readBalanced(
  source: string,
  start: number,
  open: string,
  close: string,
) {
  if (source[start] !== open) return null;

  let depth = 0;
  for (let index = start; index < source.length; index += 1) {
    if (source[index] === open && source[index - 1] !== '\\') depth += 1;
    if (source[index] === close && source[index - 1] !== '\\') depth -= 1;
    if (depth === 0) {
      return {
        value: source.slice(start + 1, index),
        end: index + 1,
      };
    }
  }

  return null;
}

function extractEnvironments(source: string, name: string): EnvironmentBlock[] {
  const tokenPattern = new RegExp(
    String.raw`\\(begin|end)\{${name}\}`,
    'g',
  );
  const blocks: EnvironmentBlock[] = [];
  const stack: Array<{
    start: number;
    bodyStart: number;
    attributes: string;
  }> = [];

  let match: RegExpExecArray | null;
  while ((match = tokenPattern.exec(source))) {
    if (match[1] === 'begin') {
      let cursor = tokenPattern.lastIndex;
      let attributes = '';
      if (source[cursor] === '[') {
        const optional = readBalanced(source, cursor, '[', ']');
        if (optional) {
          attributes = optional.value;
          cursor = optional.end;
          tokenPattern.lastIndex = cursor;
        }
      }
      stack.push({ start: match.index, bodyStart: cursor, attributes });
      continue;
    }

    const opening = stack.pop();
    if (!opening || stack.length > 0) continue;

    const end = tokenPattern.lastIndex;
    blocks.push({
      name,
      attributes: opening.attributes,
      body: source.slice(opening.bodyStart, match.index),
      raw: source.slice(opening.start, end),
      start: opening.start,
      end,
      attributesStart:
        opening.start + String.raw`\begin{${name}}`.length,
      bodyStart: opening.bodyStart,
    });
  }

  return blocks;
}

function parseAttributes(input: string) {
  const attributes = new Map<string, string>();
  let cursor = 0;

  while (cursor < input.length) {
    while (/[\s,]/.test(input[cursor] ?? '')) cursor += 1;
    if (cursor >= input.length) break;

    const keyStart = cursor;
    while (cursor < input.length && !/[\s=,]/.test(input[cursor])) {
      cursor += 1;
    }
    const key = input.slice(keyStart, cursor).trim();
    while (/\s/.test(input[cursor] ?? '')) cursor += 1;

    if (input[cursor] !== '=') {
      if (key) attributes.set(key, 'true');
      while (cursor < input.length && input[cursor] !== ',') cursor += 1;
      continue;
    }

    cursor += 1;
    while (/\s/.test(input[cursor] ?? '')) cursor += 1;
    let value = '';

    if (input[cursor] === '{') {
      const balanced = readBalanced(input, cursor, '{', '}');
      if (!balanced) break;
      value = balanced.value;
      cursor = balanced.end;
    } else {
      const valueStart = cursor;
      while (cursor < input.length && input[cursor] !== ',') cursor += 1;
      value = input.slice(valueStart, cursor).trim();
    }

    if (key) attributes.set(key, value);
  }

  return attributes;
}

function formatAttributeValue(key: string, value: string) {
  if (['code', 'section', 'knowledge'].includes(key) || /[\s,={}\[\]]/.test(value)) {
    return `${key}={${value.replace(/[{}]/g, '')}}`;
  }
  return `${key}=${value}`;
}

function serializeAttributes(attributes: Map<string, string>) {
  return [...attributes.entries()]
    .filter(([, value]) => value.trim() !== '')
    .map(([key, value]) => formatAttributeValue(key, value.trim()))
    .join(',');
}

export function getQuestionMetadataAtPosition(
  source: string,
  position: number,
): QuestionMetadataAtPosition | null {
  const blocks = extractEnvironments(source, 'question');
  const index = blocks.findIndex(
    (block) => position >= block.start && position <= block.end,
  );
  if (index < 0) return null;

  const attributes = parseAttributes(blocks[index].attributes);
  return {
    index,
    difficulty: Number(attributes.get('difficulty') ?? 2),
    knowledgeFieldSlug: attributes.get('knowledge')?.trim() || null,
  };
}

export type QuestionRangeAtPosition = {
  index: number;
  start: number;
  end: number;
};

/** Trả về vị trí (offset) khối \begin{question}...\end{question} chứa con trỏ. */
export function getQuestionRangeAtPosition(
  source: string,
  position: number,
): QuestionRangeAtPosition | null {
  const blocks = extractEnvironments(source, 'question');
  const index = blocks.findIndex(
    (block) => position >= block.start && position <= block.end,
  );
  if (index < 0) return null;
  return { index, start: blocks[index].start, end: blocks[index].end };
}

export function updateQuestionMetadataAtPosition(
  source: string,
  position: number,
  updates: {
    difficulty?: number;
    knowledgeFieldSlug?: string | null;
  },
) {
  const blocks = extractEnvironments(source, 'question');
  const block = blocks.find(
    (candidate) => position >= candidate.start && position <= candidate.end,
  );
  if (!block) return null;

  const attributes = parseAttributes(block.attributes);
  if (updates.difficulty !== undefined) {
    attributes.set('difficulty', String(updates.difficulty));
  }
  if (updates.knowledgeFieldSlug !== undefined) {
    if (updates.knowledgeFieldSlug) {
      attributes.set('knowledge', updates.knowledgeFieldSlug);
    } else {
      attributes.delete('knowledge');
    }
  }

  const serialized = serializeAttributes(attributes);
  const replacement = serialized ? `[${serialized}]` : '';
  const nextSource =
    source.slice(0, block.attributesStart) +
    replacement +
    source.slice(block.bodyStart);
  const delta =
    replacement.length - (block.bodyStart - block.attributesStart);

  return {
    source: nextSource,
    position:
      position <= block.bodyStart ? block.attributesStart + replacement.length : position + delta,
  };
}

function extractMacro(
  source: string,
  macroName: string,
): Array<{ value: string; raw: string; start: number; end: number }> {
  const matches: Array<{
    value: string;
    raw: string;
    start: number;
    end: number;
  }> = [];
  const pattern = new RegExp(String.raw`\\${macroName}\s*`, 'g');
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(source))) {
    const cursor = pattern.lastIndex;
    if (source[cursor] !== '{') continue;
    const argument = readBalanced(source, cursor, '{', '}');
    if (!argument) continue;
    matches.push({
      value: argument.value,
      raw: source.slice(match.index, argument.end),
      start: match.index,
      end: argument.end,
    });
    pattern.lastIndex = argument.end;
  }

  return matches;
}

function extractImages(source: string): Array<{
  image: AuthoringImage | null;
  raw: string;
  start: number;
  end: number;
}> {
  const images: Array<{
    image: AuthoringImage | null;
    raw: string;
    start: number;
    end: number;
  }> = [];
  const pattern = /\\image\s*/g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(source))) {
    let cursor = pattern.lastIndex;
    let optional = '';
    if (source[cursor] === '[') {
      const optionalArgument = readBalanced(source, cursor, '[', ']');
      if (!optionalArgument) continue;
      optional = optionalArgument.value;
      cursor = optionalArgument.end;
    }
    while (/\s/.test(source[cursor] ?? '')) cursor += 1;
    const urlArgument = readBalanced(source, cursor, '{', '}');
    if (!urlArgument) continue;

    const attributes = parseAttributes(optional);
    const alt = attributes.get('alt')?.trim() ?? '';
    const url = urlArgument.value.trim();
    images.push({
      image: alt && url ? { alt, url } : null,
      raw: source.slice(match.index, urlArgument.end),
      start: match.index,
      end: urlArgument.end,
    });
    pattern.lastIndex = urlArgument.end;
  }

  return images;
}

function removeRanges(
  source: string,
  ranges: Array<{ start: number; end: number }>,
) {
  return [...ranges]
    .sort((left, right) => right.start - left.start)
    .reduce(
      (result, range) =>
        result.slice(0, range.start) + result.slice(range.end),
      source,
    );
}

function cleanContent(source: string) {
  return source
    .replace(/^[ \t]+|[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function validateAuthoringMath(
  errors: AuthoringParseError[],
  source: string,
  value: string,
  fallbackOffset: number,
  fieldLabel: string,
) {
  const validation = validateMathContent(value);
  for (const issue of validation.issues) {
    if (issue.severity !== 'error') continue;
    addError(
      errors,
      source,
      fallbackOffset + issue.offset,
      `${fieldLabel}: ${issue.message}`,
    );
  }
  return validation.normalized;
}

function parseQuestion(
  source: string,
  block: EnvironmentBlock,
  errors: AuthoringParseError[],
): AuthoringQuestion | null {
  const attributes = parseAttributes(block.attributes);
  const rawType = attributes.get('type')?.trim() as ExamQuestionType | undefined;
  if (!rawType || !supportedQuestionTypes.has(rawType)) {
    addError(
      errors,
      source,
      block.start,
      'Câu hỏi cần type hợp lệ: multiple_choice, true_false, short_answer hoặc essay.',
    );
    return null;
  }

  const difficulty = Number(attributes.get('difficulty') ?? 2);
  if (!Number.isInteger(difficulty) || difficulty < 1 || difficulty > 4) {
    addError(errors, source, block.start, 'difficulty phải nằm trong khoảng 1 đến 4.');
  }

  const choices = extractEnvironments(block.body, 'choice');
  const statements = extractEnvironments(block.body, 'statement');
  const rubrics = extractEnvironments(block.body, 'rubric');
  const nestedRanges = [...choices, ...statements, ...rubrics].map((item) => ({
    start: item.start,
    end: item.end,
  }));
  let questionBody = removeRanges(block.body, nestedRanges);

  const explanations = extractMacro(questionBody, 'explanation');
  const answers = extractMacro(questionBody, 'answer');
  const questionImages = extractImages(questionBody);

  if (questionImages.length > 1) {
    addError(errors, source, block.start, 'Mỗi câu hỏi chỉ được có một ảnh chính.');
  }
  if (questionImages.some((item) => !item.image)) {
    addError(errors, source, block.start, 'Ảnh câu hỏi cần URL và alt text.');
  }

  questionBody = removeRanges(questionBody, [
    ...explanations,
    ...answers,
    ...questionImages,
  ]);

  const options = choices.map((choice, index) => {
    const choiceAttributes = parseAttributes(choice.attributes);
    const images = extractImages(choice.body);
    if (images.length > 1) {
      addError(
        errors,
        source,
        block.start + choice.start,
        'Mỗi lựa chọn chỉ được có một ảnh.',
      );
    }
    if (images.some((item) => !item.image)) {
      addError(
        errors,
        source,
        block.start + choice.start,
        'Ảnh lựa chọn cần URL và alt text.',
      );
    }
    const rawContent = cleanContent(removeRanges(choice.body, images));
    const content = validateAuthoringMath(
      errors,
      source,
      rawContent,
      block.start + choice.start,
      `Lựa chọn ${index + 1}`,
    );
    if (!content && !images[0]?.image) {
      addError(
        errors,
        source,
        block.start + choice.start,
        'Lựa chọn cần nội dung hoặc ảnh.',
      );
    }
    return {
      label:
        choiceAttributes.get('label')?.trim().toUpperCase() ??
        String.fromCharCode(65 + index),
      content,
      correct: choiceAttributes.get('correct') === 'true',
      image: images[0]?.image ?? null,
    };
  });

  const trueFalseItems = statements.map((statement, index) => {
    const statementAttributes = parseAttributes(statement.attributes);
    if (extractImages(statement.body).length > 0) {
      addError(
        errors,
        source,
        block.start + statement.start,
        'V1 chưa hỗ trợ ảnh trong từng mệnh đề đúng/sai.',
      );
    }
    const correctValue = statementAttributes.get('correct');
    if (correctValue !== 'true' && correctValue !== 'false') {
      addError(
        errors,
        source,
        block.start + statement.start,
        'Mệnh đề cần thuộc tính correct=true hoặc correct=false.',
      );
    }
    const statementContent = validateAuthoringMath(
      errors,
      source,
      cleanContent(statement.body),
      block.start + statement.start,
      `Mệnh đề ${index + 1}`,
    );
    return {
      label:
        statementAttributes.get('label')?.trim() ??
        String.fromCharCode(97 + index),
      content: statementContent,
      correct: correctValue === 'true',
    };
  });

  const rubric = rubrics.map((item) => {
    const rubricAttributes = parseAttributes(item.attributes);
    const points = Number(rubricAttributes.get('points'));
    const title = rubricAttributes.get('title')?.trim() ?? '';
    if (!title || !Number.isFinite(points) || points <= 0) {
      addError(
        errors,
        source,
        block.start + item.start,
        'Rubric cần title và points lớn hơn 0.',
      );
    }
    return {
      title,
      points,
      description: cleanContent(item.body) || null,
    };
  });

  if (rawType !== 'multiple_choice' && choices.length > 0) {
    addError(
      errors,
      source,
      block.start,
      'Chỉ câu multiple_choice được dùng môi trường choice.',
    );
  }
  if (rawType === 'multiple_choice') {
    if (options.length < 2 || options.length > 10) {
      addError(errors, source, block.start, 'Câu trắc nghiệm cần từ 2 đến 10 lựa chọn.');
    }
    if (!options.some((option) => option.correct)) {
      addError(errors, source, block.start, 'Câu trắc nghiệm cần ít nhất một đáp án đúng.');
    }
  }
  if (rawType === 'true_false' && trueFalseItems.length === 0) {
    addError(errors, source, block.start, 'Câu đúng/sai cần ít nhất một statement.');
  }
  if (rawType === 'short_answer' && !answers[0]?.value.trim()) {
    addError(errors, source, block.start, 'Câu trả lời ngắn cần macro \\answer{...}.');
  }

  const content = validateAuthoringMath(
    errors,
    source,
    cleanContent(questionBody),
    block.bodyStart,
    'Nội dung câu hỏi',
  );
  if (!content && !questionImages[0]?.image) {
    addError(errors, source, block.start, 'Câu hỏi cần nội dung hoặc ảnh.');
  }

  return {
    code: attributes.get('code')?.trim() || null,
    section: attributes.get('section')?.trim().toUpperCase() || null,
    knowledgeFieldSlug: attributes.get('knowledge')?.trim().toLowerCase() || null,
    type: rawType,
    difficulty,
    content,
    explanation: explanations[0]?.value.trim()
      ? validateAuthoringMath(
          errors,
          source,
          explanations[0].value.trim(),
          block.start + explanations[0].start,
          'Lời giải',
        )
      : null,
    image: questionImages[0]?.image ?? null,
    options,
    trueFalseItems,
    answer: answers[0]?.value.trim() || null,
    rubric,
  };
}

export function parseAuthoringSource(
  source: string,
  mode: AuthoringMode,
): AuthoringParseResult {
  const errors: AuthoringParseError[] = [];

  try {
    parseLatexAst(source);
  } catch (error) {
    addError(
      errors,
      source,
      0,
      error instanceof Error ? error.message : 'Nguồn LaTeX không hợp lệ.',
    );
  }

  const questionBlocks = extractEnvironments(source, 'question');
  if (questionBlocks.length === 0) {
    addError(errors, source, 0, 'Nguồn cần ít nhất một môi trường question.');
  }
  if (mode === 'question' && questionBlocks.length !== 1) {
    addError(errors, source, 0, 'Chế độ Từng câu chỉ cho phép đúng một câu hỏi.');
  }

  const outsideQuestions = removeRanges(
    source,
    questionBlocks.map((block) => ({ start: block.start, end: block.end })),
  );
  if (extractImages(outsideQuestions).length > 0) {
    addError(errors, source, 0, 'Macro \\image phải nằm trong question hoặc choice.');
  }

  const questions = questionBlocks
    .map((block) => parseQuestion(source, block, errors))
    .filter((question): question is AuthoringQuestion => question !== null);

  return { mode, questions, errors };
}

export function collectAuthoringImages(questions: AuthoringQuestion[]) {
  return questions.flatMap((question) => [
    ...(question.image ? [question.image] : []),
    ...question.options.flatMap((option) => (option.image ? [option.image] : [])),
  ]);
}
