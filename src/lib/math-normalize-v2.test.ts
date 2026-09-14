import { describe, expect, it } from 'vitest';
import { normalizeMathV2 } from './math-normalize-v2';
import { validateMathContent } from './math-content';

describe('math normalize v2', () => {
  it('wraps bare y=f(x)', () => {
    const r = normalizeMathV2('Cho hàm số y = f(x) có bảng biến thiên.');
    expect(r.normalized).toContain('$y = f(x)$');
  });
  it('converts unicode superscript', () => {
    const r = normalizeMathV2('Cho hàm số y = ax³ + bx².');
    expect(r.normalized).toContain('x^3');
    expect(r.normalized).toContain('x^2');
  });
  it('fixes f x typo', () => {
    const r = normalizeMathV2('Cho hàm số f x đồng biến.');
    expect(r.normalized).toContain('f(x)');
  });
  it('braces multi-digit exponents', () => {
    const r = normalizeMathV2('Giá trị $x^12$ và $e^-x$.');
    expect(r.normalized).toContain('x^{12}');
    expect(r.normalized).toContain('e^{-x}');
  });
  it('decodes html entities', () => {
    const r = normalizeMathV2('Bảng <table><tr><td>y&#x27;</td></tr></table>');
    expect(r.normalized).toContain("y'");
  });
  it('fixes vietnamese typos outside math', () => {
    const r = normalizeMathV2('bề chứa nước có vecto và Lòi giải $x^2$.');
    expect(r.normalized).toContain('bể chứa nước');
    expect(r.normalized).toContain('vectơ');
    expect(r.normalized).toContain('Lời giải');
    expect(r.normalized).toContain('$x^2$');
  });
  it('wraps bare trig equation without swallowing text', () => {
    const r = normalizeMathV2('Tập nghiệm của phương trình sin x = -1 là');
    expect(r.normalized).toContain('$\\sin x = -1$');
    expect(r.normalized).toContain(' là');
  });
  it('adds backslash to lim inside math', () => {
    const r = normalizeMathV2('$lim_{x \\to 0} x$.');
    expect(r.normalized).toContain('\\lim');
    expect(validateMathContent(r.normalized).valid).toBe(true);
  });
  it('is idempotent', () => {
    const samples = [
      'Cho hàm số $y = f(x)$ có $x^{12}$.',
      'bể chứa nước $x^2$.',
      'Tập nghiệm $\\sin x = -1$ là',
    ];
    for (const s of samples) {
      const once = normalizeMathV2(s).normalized;
      const twice = normalizeMathV2(once).normalized;
      expect(twice).toBe(once);
    }
  });
  it('does not break already-valid content', () => {
    const s = 'Cho hàm số $y=\\frac{2x^2+5x}{x+3}$ có đồ thị (C).';
    const r = normalizeMathV2(s);
    expect(validateMathContent(r.normalized).valid).toBe(true);
  });
});
