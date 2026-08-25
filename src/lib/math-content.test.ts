import { describe, expect, it } from 'vitest';
import {
  extractMathSegments,
  normalizeMathContent,
  validateMathContent,
} from './math-content';

describe('math content v2', () => {
  it('accepts inline and display KaTeX', () => {
    const result = validateMathContent(
      'Cho $x^2 + 1$ và $$\\begin{cases}x=1\\\\y=2\\end{cases}$$.',
    );
    expect(result.valid).toBe(true);
    expect(result.segments).toHaveLength(2);
    expect(result.segments[1].display).toBe(true);
  });

  it('normalizes backslash delimiters and line endings', () => {
    expect(normalizeMathContent('  \\(x+1\\)\r\n\r\n\r\n\\[y=2\\]  ')).toBe(
      '$x+1$\n\n$$y=2$$',
    );
  });

  it('rejects odd delimiters and TeX commands outside math', () => {
    expect(validateMathContent('Giá trị $x+1').issues[0].code).toBe(
      'UNCLOSED_MATH_DELIMITER',
    );
    expect(validateMathContent('Giá trị \\frac{1}{2}').issues[0].code).toBe(
      'TEX_OUTSIDE_MATH',
    );
  });

  it('reports invalid KaTeX instead of silently rendering it', () => {
    const result = validateMathContent('$\\notacommand{1}$');
    expect(result.valid).toBe(false);
    expect(result.issues.some((issue) => issue.code === 'KATEX_PARSE_ERROR')).toBe(true);
  });

  it('keeps safe table structure and strips presentation attributes', () => {
    const normalized = normalizeMathContent(
      '<table border="1" style="color:red"><tr><td colspan="2" onclick="x()">A</td></tr></table>',
    );
    expect(normalized).toBe(
      '<table><tr><td colspan="2">A</td></tr></table>',
    );
  });

  it('does not treat escaped dollars as math', () => {
    const result = extractMathSegments('Giá \\$5 và $x=5$.');
    expect(result.segments).toHaveLength(1);
    expect(result.segments[0].value).toBe('x=5');
  });
});
