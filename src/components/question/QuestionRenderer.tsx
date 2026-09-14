'use client';

import { useMemo, useRef, useState } from 'react';
import type { ClipboardEvent, FocusEvent, KeyboardEvent } from 'react';
import Image from 'next/image';
import ReactMarkdown from 'react-markdown';
import rehypeKatex from 'rehype-katex';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import { validateMathContent } from '@/lib/math-content';
import type { ExamQuestionType } from '@/lib/supabase/exam-data';
import styles from '@/styles/question-renderer.module.css';

export type RenderableQuestionOption = {
  id: string;
  label: string;
  content: string;
  imageUrl: string | null;
  imageAltText: string | null;
  imageWidth?: number | null;
  imageHeight?: number | null;
  correct?: boolean;
};

export type RenderableTrueFalseItem = {
  id: string;
  label?: string | null;
  content: string;
  correct?: boolean;
};

export type RenderableQuestion = {
  id: string;
  displayNo: string;
  type: ExamQuestionType;
  content: string;
  imageUrl: string | null;
  imageAltText: string | null;
  imageWidth?: number | null;
  imageHeight?: number | null;
  options: RenderableQuestionOption[];
  trueFalseItems: RenderableTrueFalseItem[];
  maxPoints?: number;
  contentFormatVersion?: number;
};

type QuestionRendererProps = {
  question: RenderableQuestion;
  section?: 'all' | 'prompt' | 'answer';
  selectedOptionId?: string;
  trueFalseAnswers?: Record<string, 'true' | 'false'>;
  textValue?: string;
  showSolutions?: boolean;
  onSelectOption?: (optionId: string, label: string) => void;
  onTrueFalseChange?: (itemId: string, value: 'true' | 'false') => void;
  onTextChange?: (value: string) => void;
  onTextBlur?: () => void;
};

const SHORT_ANSWER_LENGTH = 4;
const SHORT_ANSWER_DIGIT = /^\d$/;

export function normalizeShortAnswer(value: string): string {
  let result = '';

  for (const character of value.replaceAll('.', ',')) {
    if (SHORT_ANSWER_DIGIT.test(character)) {
      result += character;
    } else if (character === '-' && result.length === 0) {
      result += character;
    } else if (character === ',' && !result.includes(',')) {
      result += character;
    }

    if (result.length === SHORT_ANSWER_LENGTH) break;
  }

  return result;
}

export function serializeShortAnswerForScoring(value: string): string {
  return normalizeShortAnswer(value).replace(',', '.');
}

function ShortAnswerInput({
  value,
  disabled,
  onChange,
  onBlur,
}: {
  value: string;
  disabled: boolean;
  onChange?: (value: string) => void;
  onBlur?: () => void;
}) {
  const groupRef = useRef<HTMLDivElement>(null);
  const inputRefs = useRef<Array<HTMLInputElement | null>>([]);
  const normalizedValue = normalizeShortAnswer(value);
  const characters = normalizedValue.split('');

  const focusCell = (index: number) => {
    inputRefs.current[Math.max(0, Math.min(index, SHORT_ANSWER_LENGTH - 1))]?.focus();
  };

  const commitCharacters = (nextCharacters: string[], nextFocusIndex?: number) => {
    onChange?.(normalizeShortAnswer(nextCharacters.join('')));
    if (nextFocusIndex !== undefined) {
      requestAnimationFrame(() => focusCell(nextFocusIndex));
    }
  };

  const insertAt = (index: number, rawValue: string) => {
    const insertion = normalizeShortAnswer(rawValue);
    const nextCharacters = [...characters];
    const insertionIndex = Math.min(index, nextCharacters.length);

    if (!insertion) {
      if (index < nextCharacters.length) nextCharacters.splice(index, 1);
      commitCharacters(nextCharacters);
      return;
    }

    nextCharacters.splice(insertionIndex, index < nextCharacters.length ? 1 : 0, ...insertion);
    commitCharacters(
      nextCharacters,
      Math.min(insertionIndex + insertion.length, SHORT_ANSWER_LENGTH - 1),
    );
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>, index: number) => {
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      focusCell(index - 1);
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      focusCell(index + 1);
    } else if (event.key === 'Backspace' && !characters[index] && index > 0) {
      event.preventDefault();
      const nextCharacters = [...characters];
      nextCharacters.splice(index - 1, 1);
      commitCharacters(nextCharacters, index - 1);
    } else if (event.key === 'Delete' && characters[index]) {
      event.preventDefault();
      const nextCharacters = [...characters];
      nextCharacters.splice(index, 1);
      commitCharacters(nextCharacters, index);
    }
  };

  const handlePaste = (event: ClipboardEvent<HTMLInputElement>, index: number) => {
    event.preventDefault();
    insertAt(index, event.clipboardData.getData('text'));
  };

  const handleBlur = (event: FocusEvent<HTMLInputElement>) => {
    if (!groupRef.current?.contains(event.relatedTarget as Node | null)) {
      onBlur?.();
    }
  };

  return (
    <div className={styles.shortAnswerBlock}>
      <div
        ref={groupRef}
        className={styles.shortAnswerGrid}
        role="group"
        aria-label="Đáp án trả lời ngắn gồm 4 ô"
      >
        {Array.from({ length: SHORT_ANSWER_LENGTH }, (_, index) => (
          <input
            key={index}
            ref={(element) => {
              inputRefs.current[index] = element;
            }}
            className={styles.shortAnswerCell}
            value={characters[index] ?? ''}
            disabled={disabled}
            inputMode="decimal"
            maxLength={1}
            autoComplete="off"
            aria-label={`Ô đáp án ${index + 1}`}
            onFocus={(event) => event.currentTarget.select()}
            onChange={(event) => insertAt(index, event.target.value)}
            onKeyDown={(event) => handleKeyDown(event, index)}
            onPaste={(event) => handlePaste(event, index)}
            onBlur={handleBlur}
          />
        ))}
      </div>
      {!disabled ? (
        <p className={styles.shortAnswerHint}>
          Tối đa 4 ký tự. Phần thập phân dùng dấu phẩy (,).
        </p>
      ) : null}
    </div>
  );
}

const mathSanitizeSchema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    code: [...(defaultSchema.attributes?.code ?? []), 'className'],
    th: [...(defaultSchema.attributes?.th ?? []), 'colSpan', 'rowSpan', 'scope'],
    td: [...(defaultSchema.attributes?.td ?? []), 'colSpan', 'rowSpan'],
  },
};

export function MathText({ value }: { value: string }) {
  const validation = useMemo(() => validateMathContent(value), [value]);
  const errorSummary = validation.issues
    .filter((issue) => issue.severity === 'error')
    .map((issue) => issue.message)
    .join(' ');

  return (
    <div
      className={`${styles.mathContent} ${validation.valid ? '' : styles.invalidMath}`}
      data-math-valid={validation.valid ? 'true' : 'false'}
      title={errorSummary || undefined}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[
          rehypeRaw,
          [rehypeSanitize, mathSanitizeSchema],
          [rehypeKatex, { trust: false, strict: 'warn', throwOnError: false }],
        ]}
        components={{
          p: ({ children }) => <span className={styles.mathParagraph}>{children}</span>,
          a: ({ children }) => <span>{children}</span>,
        }}
      >
        {validation.normalized}
      </ReactMarkdown>
      {!validation.valid ? (
        <span className={styles.mathError} role="status" aria-live="polite">
          Công thức cần được quản trị viên kiểm tra.
        </span>
      ) : null}
    </div>
  );
}

function QuestionImage({
  url,
  alt,
  width,
  height,
}: {
  url: string;
  alt: string | null;
  width?: number | null;
  height?: number | null;
}) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div className={styles.imageFallback} role="img" aria-label={alt ?? 'Ảnh lỗi'}>
        Không tải được ảnh: {alt || 'không có mô tả'}
      </div>
    );
  }

  return (
    <Image
      className={styles.questionImage}
      src={url}
      alt={alt ?? ''}
      width={width ?? 1200}
      height={height ?? 800}
      sizes="(max-width: 768px) 92vw, 760px"
      onError={() => setFailed(true)}
    />
  );
}

export default function QuestionRenderer({
  question,
  section = 'all',
  selectedOptionId,
  trueFalseAnswers = {},
  textValue = '',
  showSolutions = false,
  onSelectOption,
  onTrueFalseChange,
  onTextChange,
  onTextBlur,
}: QuestionRendererProps) {
  const showPrompt = section !== 'answer';
  const showAnswer = section !== 'prompt';

  return (
    <div className={styles.renderer}>
      {showPrompt ? (
        <>
          <div className={styles.heading}>
            <strong>Câu {question.displayNo}.</strong>{' '}
            <MathText value={question.content} />
          </div>

          {question.maxPoints !== undefined ? (
            <p className={styles.meta}>{question.maxPoints} điểm</p>
          ) : null}

          {question.imageUrl ? (
            <QuestionImage
              key={question.imageUrl}
              url={question.imageUrl}
              alt={question.imageAltText}
              width={question.imageWidth}
              height={question.imageHeight}
            />
          ) : null}
        </>
      ) : null}

      {showAnswer && question.type === 'multiple_choice' ? (
        <div
          className={styles.options}
          role="radiogroup"
          aria-label={`Đáp án Câu ${question.displayNo}`}
        >
          {question.options.map((option) => (
            <label
              key={option.id}
              className={`${styles.option} ${
                showSolutions && option.correct ? styles.correctOption : ''
              }`}
            >
              <input
                type="radio"
                name={`question-${question.id}`}
                value={option.id}
                checked={selectedOptionId === option.id}
                disabled={!onSelectOption}
                onChange={() => onSelectOption?.(option.id, option.label)}
              />
              <span className={styles.optionBody}>
                <div>
                  <strong>{option.label}.</strong>{' '}
                  <MathText value={option.content} />
                </div>
                {option.imageUrl ? (
                  <QuestionImage
                    key={option.imageUrl}
                    url={option.imageUrl}
                    alt={option.imageAltText}
                    width={option.imageWidth}
                    height={option.imageHeight}
                  />
                ) : null}
              </span>
            </label>
          ))}
        </div>
      ) : null}

      {showAnswer && question.type === 'true_false' ? (
        <div className={styles.trueFalseList}>
          {question.trueFalseItems.map((item) => (
            <div
              key={item.id}
              className={styles.trueFalseItem}
              role="radiogroup"
              aria-label={`Câu ${question.displayNo} ý ${item.label ?? ''}`}
            >
              <div>
                {item.label ? <strong>{item.label}) </strong> : null}
                <MathText value={item.content} />
              </div>
              {showSolutions ? (
                <em>{item.correct ? 'Đúng' : 'Sai'}</em>
              ) : (
                <div className={styles.trueFalseControls}>
                  <label>
                    <input
                      type="radio"
                      name={`tf-${question.id}-${item.id}`}
                      checked={trueFalseAnswers[item.id] === 'true'}
                      onChange={() => onTrueFalseChange?.(item.id, 'true')}
                    />
                    Đúng
                  </label>
                  <label>
                    <input
                      type="radio"
                      name={`tf-${question.id}-${item.id}`}
                      checked={trueFalseAnswers[item.id] === 'false'}
                      onChange={() => onTrueFalseChange?.(item.id, 'false')}
                    />
                    Sai
                  </label>
                </div>
              )}
            </div>
          ))}
        </div>
      ) : null}

      {showAnswer && question.type === 'short_answer' ? (
        <ShortAnswerInput
          value={textValue}
          disabled={!onTextChange}
          onChange={onTextChange}
          onBlur={onTextBlur}
        />
      ) : null}

      {showAnswer && question.type === 'essay' ? (
        <div>
          <label
            htmlFor={`essay-${question.id}`}
            className={styles.meta}
            style={{ display: 'block' }}
          >
            Bài làm tự luận Câu {question.displayNo}
          </label>
          <textarea
            id={`essay-${question.id}`}
            name={`essay-${question.id}`}
            className={styles.textAnswer}
            value={textValue}
            disabled={!onTextChange}
            onChange={(event) => onTextChange?.(event.target.value)}
            onBlur={onTextBlur}
            placeholder="Nhập bài làm"
            rows={8}
          />
        </div>
      ) : null}
    </div>
  );
}
