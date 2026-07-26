'use client';

import { useMemo, useRef, useState } from 'react';
import type { ClipboardEvent, FocusEvent, KeyboardEvent } from 'react';
import katex from 'katex';
import type { ExamQuestionType } from '@/lib/supabase/exam-data';
import styles from '@/styles/question-renderer.module.css';

export type RenderableQuestionOption = {
  id: string;
  label: string;
  content: string;
  imageUrl: string | null;
  imageAltText: string | null;
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
  options: RenderableQuestionOption[];
  trueFalseItems: RenderableTrueFalseItem[];
  maxPoints?: number;
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

export function MathText({ value }: { value: string }) {
  const parts = useMemo(() => {
    const tokens: Array<
      | { type: 'text'; value: string }
      | { type: 'math'; value: string; display: boolean }
    > = [];
    const pattern = /\$\$([\s\S]+?)\$\$|\$([^$\n]+?)\$/g;
    let cursor = 0;
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(value))) {
      if (match.index > cursor) {
        tokens.push({ type: 'text', value: value.slice(cursor, match.index) });
      }
      tokens.push({
        type: 'math',
        value: match[1] ?? match[2],
        display: Boolean(match[1]),
      });
      cursor = pattern.lastIndex;
    }
    if (cursor < value.length) {
      tokens.push({ type: 'text', value: value.slice(cursor) });
    }
    return tokens;
  }, [value]);

  return (
    <>
      {parts.map((part, index) => {
        if (part.type === 'text') {
          return <span key={index}>{part.value}</span>;
        }

        return (
          <span
            key={index}
            className={part.display ? styles.displayMath : styles.inlineMath}
            dangerouslySetInnerHTML={{
              __html: katex.renderToString(part.value, {
                displayMode: part.display,
                throwOnError: false,
                trust: false,
                strict: 'warn',
              }),
            }}
          />
        );
      })}
    </>
  );
}

function QuestionImage({
  url,
  alt,
}: {
  url: string;
  alt: string | null;
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
    // R2 hosts are registry-driven and cannot be enumerated in next/image config.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      className={styles.questionImage}
      src={url}
      alt={alt ?? ''}
      loading="lazy"
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
            />
          ) : null}
        </>
      ) : null}

      {showAnswer && question.type === 'multiple_choice' ? (
        <div className={styles.options}>
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
                <span>
                  <strong>{option.label}.</strong>{' '}
                  <MathText value={option.content} />
                </span>
                {option.imageUrl ? (
                  <QuestionImage
                    key={option.imageUrl}
                    url={option.imageUrl}
                    alt={option.imageAltText}
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
            <div key={item.id} className={styles.trueFalseItem}>
              <span>
                {item.label ? <strong>{item.label}) </strong> : null}
                <MathText value={item.content} />
              </span>
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
        <textarea
          className={styles.textAnswer}
          value={textValue}
          disabled={!onTextChange}
          onChange={(event) => onTextChange?.(event.target.value)}
          onBlur={onTextBlur}
          placeholder="Nhập bài làm"
          rows={8}
        />
      ) : null}
    </div>
  );
}
