import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  MathText,
  normalizeShortAnswer,
  serializeShortAnswerForScoring,
} from './QuestionRenderer';

describe('normalizeShortAnswer', () => {
  it('keeps a THPT short answer within four cells', () => {
    expect(normalizeShortAnswer('33,5')).toBe('33,5');
    expect(normalizeShortAnswer('-25')).toBe('-25');
    expect(normalizeShortAnswer('12345')).toBe('1234');
  });

  it('uses a comma as the decimal separator', () => {
    expect(normalizeShortAnswer('4.41')).toBe('4,41');
    expect(normalizeShortAnswer(' 4,41 ')).toBe('4,41');
  });

  it('serializes the Vietnamese decimal separator for numeric scoring', () => {
    expect(serializeShortAnswerForScoring('4,41')).toBe('4.41');
  });

  it('removes unsupported or duplicate symbols', () => {
    expect(normalizeShortAnswer('a-3,,5')).toBe('-3,5');
  });
});

describe('MathText', () => {
  it('renders accessible KaTeX without raw inner HTML handling', () => {
    const html = renderToStaticMarkup(createElement(MathText, { value: 'Cho $\\frac{1}{2}$.' }));
    expect(html).toContain('class="katex"');
    expect(html).toContain('<math');
    expect(html).toContain('data-math-valid="true"');
  });

  it('renders sanitized tables and strips active attributes', () => {
    const html = renderToStaticMarkup(
      createElement(MathText, {
        value: '<table style="color:red"><tr><td colspan="2" onclick="x()">A</td></tr></table>',
      }),
    );
    expect(html).toContain('<table>');
    expect(html).toContain('colSpan="2"');
    expect(html).not.toContain('onclick');
    expect(html).not.toContain('color:red');
  });

  it('exposes a visible review state for malformed formulas', () => {
    const html = renderToStaticMarkup(createElement(MathText, { value: 'Giá trị $x+1' }));
    expect(html).toContain('data-math-valid="false"');
    expect(html).toContain('Công thức cần được quản trị viên kiểm tra.');
  });
});
