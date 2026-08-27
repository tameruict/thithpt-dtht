import { describe, expect, it } from 'vitest';
import {
  getQuestionMetadataAtPosition,
  parseAuthoringSource,
  updateQuestionMetadataAtPosition,
} from './parser';

describe('parseAuthoringSource', () => {
  it('parses question and option R2 images', () => {
    const result = parseAuthoringSource(
      String.raw`\begin{question}[type=multiple_choice,difficulty=2]
Nội dung $x^2$.
\image[alt={Ảnh câu hỏi}]{https://cdn.example.com/question.webp}
\begin{choice}[correct,label=A]
\image[alt={Ảnh đáp án A}]{https://cdn.example.com/a.webp}
\end{choice}
\begin{choice}[label=B]
Đáp án B
\end{choice}
\end{question}`,
      'question',
    );

    expect(result.errors).toEqual([]);
    expect(result.questions[0].image?.alt).toBe('Ảnh câu hỏi');
    expect(result.questions[0].options[0].content).toBe('');
    expect(result.questions[0].options[0].image?.url).toContain('/a.webp');
  });

  it('rejects images in true false statements', () => {
    const result = parseAuthoringSource(
      String.raw`\begin{question}[type=true_false]
Nội dung
\begin{statement}[correct=true]
\image[alt={Không hỗ trợ}]{https://cdn.example.com/a.webp}
\end{statement}
\end{question}`,
      'question',
    );

    expect(result.errors.some((error) => error.message.includes('đúng/sai'))).toBe(true);
  });

  it('rejects multiple main images', () => {
    const result = parseAuthoringSource(
      String.raw`\begin{question}[type=essay]
\image[alt={Ảnh một}]{https://cdn.example.com/one.webp}
\image[alt={Ảnh hai}]{https://cdn.example.com/two.webp}
\end{question}`,
      'question',
    );

    expect(result.errors.some((error) => error.message.includes('một ảnh chính'))).toBe(true);
  });

  it('parses difficulty and knowledge metadata', () => {
    const result = parseAuthoringSource(
      String.raw`\begin{question}[type=essay,difficulty=4,knowledge={dao-ham}]
Nội dung
\end{question}`,
      'question',
    );

    expect(result.questions[0].difficulty).toBe(4);
    expect(result.questions[0].knowledgeFieldSlug).toBe('dao-ham');
  });

  it('updates metadata on the question containing the cursor', () => {
    const source = String.raw`\begin{question}[type=essay,difficulty=2]
Câu một
\end{question}

\begin{question}[type=essay,difficulty=1]
Câu hai
\end{question}`;
    const cursor = source.indexOf('Câu hai');
    const updated = updateQuestionMetadataAtPosition(source, cursor, {
      difficulty: 4,
      knowledgeFieldSlug: 'nguyen-ham',
    });

    expect(updated).not.toBeNull();
    expect(updated?.source).toContain(
      String.raw`\begin{question}[type=essay,difficulty=4,knowledge={nguyen-ham}]`,
    );
    expect(
      getQuestionMetadataAtPosition(updated?.source ?? '', updated?.position ?? 0),
    ).toMatchObject({
      index: 1,
      difficulty: 4,
      knowledgeFieldSlug: 'nguyen-ham',
    });
  });
});
