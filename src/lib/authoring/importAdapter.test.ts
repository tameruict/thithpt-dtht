import { describe, expect, it } from 'vitest';
import { buildAuthoringDsl, buildQuestionDsl } from './importAdapter';
import { validateImportDocument, type ImportDocument } from './importSchema';
import { parseAuthoringSource } from './parser';

const sampleDoc: ImportDocument = {
  source: { subjectCode: 'TOAN', year: 2026, round: 1, school: 'THPT Mai Anh Tuấn' },
  questions: [
    {
      part: 'I',
      no: 1,
      difficulty: 2,
      content: 'Giá trị nhỏ nhất của hàm số $f(x)=(x-1)^2$ là bao nhiêu?',
      options: [
        { label: 'A', content: '$0$', correct: true },
        { label: 'B', content: '$1$' },
        { label: 'C', content: '$-1$' },
        { label: 'D', content: '$2$' },
      ],
      explanation: 'Vì bình phương không âm nên giá trị nhỏ nhất bằng 0.',
    },
    {
      part: 'II',
      no: 2,
      content: 'Xét các mệnh đề sau:',
      trueFalseItems: [
        { label: 'a', content: 'Mệnh đề thứ nhất đúng.', correct: true },
        { label: 'b', content: 'Mệnh đề thứ hai sai.', correct: false },
      ],
    },
    {
      part: 'III',
      no: 3,
      content: 'Tính giá trị của $2+2$.',
      answer: 4,
    },
    {
      type: 'essay',
      no: 4,
      difficulty: 3,
      content: 'Trình bày quan điểm của em về vấn đề.',
    },
  ],
};

describe('validateImportDocument', () => {
  it('chấp nhận tài liệu hợp lệ', () => {
    const result = validateImportDocument(sampleDoc);
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('báo lỗi khi thiếu subjectCode', () => {
    const result = validateImportDocument({ source: {}, questions: sampleDoc.questions });
    expect(result.ok).toBe(false);
    expect(result.errors.join(' ')).toContain('subjectCode');
  });

  it('báo lỗi câu trắc nghiệm không có đáp án đúng', () => {
    const result = validateImportDocument({
      source: { subjectCode: 'TOAN' },
      questions: [
        {
          part: 'I',
          content: 'Câu hỏi.',
          options: [
            { label: 'A', content: 'A' },
            { label: 'B', content: 'B' },
          ],
        },
      ],
    });
    expect(result.ok).toBe(false);
    expect(result.errors.join(' ')).toContain('đáp án đúng');
  });

  it('báo lỗi khi thiếu content và difficulty ngoài 1-4', () => {
    const result = validateImportDocument({
      source: { subjectCode: 'TOAN' },
      questions: [{ part: 'III', answer: '4', difficulty: 5 }],
    });
    expect(result.ok).toBe(false);
    expect(result.errors.join(' ')).toContain('content');
    expect(result.errors.join(' ')).toContain('difficulty');
  });

  it('báo lỗi câu trả lời ngắn thiếu answer', () => {
    const result = validateImportDocument({
      source: { subjectCode: 'TOAN' },
      questions: [{ part: 'III', content: 'Tính $1+1$.' }],
    });
    expect(result.ok).toBe(false);
    expect(result.errors.join(' ')).toContain('answer');
  });
});

describe('buildAuthoringDsl round-trip', () => {
  it('sinh DSL parse lại không lỗi và giữ đúng dữ liệu', () => {
    const dsl = buildAuthoringDsl(sampleDoc);
    const parsed = parseAuthoringSource(dsl, 'paper');

    expect(parsed.errors).toEqual([]);
    expect(parsed.questions).toHaveLength(4);

    const [mc, tf, short, essay] = parsed.questions;

    expect(mc.type).toBe('multiple_choice');
    expect(mc.section).toBe('I');
    expect(mc.options).toHaveLength(4);
    expect(mc.options.filter((option) => option.correct).map((option) => option.label)).toEqual(['A']);
    expect(mc.explanation).toContain('bình phương');

    expect(tf.type).toBe('true_false');
    expect(tf.trueFalseItems.map((item) => item.correct)).toEqual([true, false]);

    expect(short.type).toBe('short_answer');
    expect(short.answer).toBe('4');

    expect(essay.type).toBe('essay');
    expect(essay.difficulty).toBe(3);
  });

  it('câu đơn không bọc \\begin{exam} và parse ở mode question', () => {
    const single = buildQuestionDsl(sampleDoc.questions[0]);
    expect(single.startsWith('\\begin{question}')).toBe(true);
    expect(single).not.toContain('\\begin{exam}');

    const parsed = parseAuthoringSource(single, 'question');
    expect(parsed.errors).toEqual([]);
    expect(parsed.questions).toHaveLength(1);
    expect(parsed.questions[0].type).toBe('multiple_choice');
  });
});
