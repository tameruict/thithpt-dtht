import { extractMathSegments, normalizeMathContent, validateMathContent } from './math-content';

// Normalizer v2: safe auto-fix for Word/OCR imports.
// Principle: split math ($...$/$$...$$) vs text, fix each zone separately, idempotent.

const SUP_MAP: Record<string, string> = {
  '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4',
  '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9',
  '⁺': '+', '⁻': '-', '⁼': '=', '⁽': '(', '⁾': ')', 'ⁿ': 'n', 'ˣ': 'x',
};

// Whole-word Vietnamese OCR typos. Applied ONLY to text outside $...$.
// Keep list narrow to avoid false positives.
const VI_TYPO: Array<[RegExp, string]> = [
  [/\bbề chứa\b/gi, 'bể chứa'],
  [/\bbề nước\b/gi, 'bể nước'],
  [/\bbề cá\b/gi, 'bể cá'],
  [/\bcạnh đấy\b/gi, 'cạnh đáy'],
  [/\bđấy bể\b/gi, 'đáy bể'],
  [/\bđáy bề\b/gi, 'đáy bể'],
  [/\bhình hộp chữ nhất\b/gi, 'hình hộp chữ nhật'],
  [/\bhợp chữ nhật\b/gi, 'hộp chữ nhật'],
  [/\bchờ được\b/gi, 'chở được'],
  [/\bvẹcto\b/gi, 'vectơ'],
  [/\bvector\b/gi, 'vectơ'],
  [/\bvecto\b/gi, 'vectơ'],
  [/\bđinh chóp\b/gi, 'đỉnh chóp'],
  [/\bđinh S\b/g, 'đỉnh S'],
  [/\bcác đinh\b/gi, 'các đỉnh'],
  [/\bLòi giải\b/g, 'Lời giải'],
  [/\bchúa mốt\b/gi, 'chứa mốt'],
  [/\bNhóm chúa\b/g, 'Nhóm chứa'],
  [/\bthần gỗ\b/gi, 'thân gỗ'],
  [/\bkề tù\b/gi, 'kể từ'],
  [/\bkẻ từ khi\b/gi, 'kể từ khi'],
  [/\bnòng độ\b/gi, 'nồng độ'],
  [/\btiêm cận\b/gi, 'tiệm cận'],
  [/\bđưòng thẳng\b/gi, 'đường thẳng'],
  [/\bđường thằng\b/gi, 'đường thẳng'],
  [/\bmăt phẳng\b/gi, 'mặt phẳng'],
  [/\bmặt phăng\b/gi, 'mặt phẳng'],
  [/\bhàm sô\b/gi, 'hàm số'],
  [/\bđô thị hàm số\b/gi, 'đồ thị hàm số'],
  [/\bdiên tích\b/gi, 'diện tích'],
  [/\bĐiên tích\b/g, 'Diện tích'],
  [/\bthê tích\b/gi, 'thể tích'],
  [/\bphưong trình\b/gi, 'phương trình'],
  [/\bphương trinh\b/gi, 'phương trình'],
  [/\bhinh nỏn\b/gi, 'hình nón'],
  [/\bsô phức\b/gi, 'số phức'],
  [/\bkhảng định\b/gi, 'khẳng định'],
  [/\bbằng biến thiên\b/gi, 'bảng biến thiên'],
  [/\bKhoảng diếm\b/g, 'Khoảng điểm'],
  [/\bMót của\b/g, 'Mốt của'],
  [/\bbiến báo\b/gi, 'biển báo'],
  [/\bgiám về\b/gi, 'giảm về'],
  [/\bhình phảng\b/gi, 'hình phẳng'],
  [/\btrên Ủ\b/g, 'trên ℝ'],
  [/\bbạc ba\b/gi, 'bậc ba'],
  [/\bKhoảng biển thiên\b/g, 'Khoảng biến thiên'],
  [/\btư phân vị\b/gi, 'tứ phân vị'],
  [/\bmẫu số liêu\b/gi, 'mẫu số liệu'],
];

function decodeEntities(value: string, applied: string[]): string {
  let out = value;
  const replace = (re: RegExp, to: string, code: string) => {
    if (re.test(out)) {
      out = out.replace(re, to);
      applied.push(code);
    }
  };
  replace(/&#x27;|&#39;|&apos;/gi, "'", 'decode-apos');
  replace(/&quot;/gi, '"', 'decode-quot');
  replace(/&nbsp;/gi, ' ', 'decode-nbsp');
  replace(/&amp;/gi, '&', 'decode-amp');
  replace(/[’‘′´]/g, "'", 'decode-quote-variant');
  return out;
}

function fixSupTags(value: string, applied: string[]): string {
  if (/<\s*sup\s*>/i.test(value)) {
    applied.push('sup-tag');
    return value.replace(/<\s*sup\s*>(.*?)<\s*\/\s*sup\s*>/gi, '^{$1}');
  }
  return value;
}

function fixUnicodeSup(value: string, applied: string[]): string {
  const re = /[⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻⁼⁽⁾ⁿˣ]+/g;
  if (!re.test(value)) return value;
  applied.push('unicode-sup');
  return value.replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻⁼⁽⁾ⁿˣ]+/g, (m) => {
    const mapped = [...m].map((c) => SUP_MAP[c] ?? c).join('');
    return mapped.length === 1 ? `^${mapped}` : `^{${mapped}}`;
  });
}

function fixCaretSpacing(value: string, applied: string[]): string {
  // x ^ 2 -> x^2, e^ -x -> e^-x. Safe globally: ^ in prose is ~always math.
  if (/\^\s|\s\^/.test(value)) {
    const next = value.replace(/(\S)\s*\^\s*/g, '$1^');
    if (next !== value) {
      applied.push('caret-spacing');
      return next;
    }
  }
  return value;
}

function fixDoubleCaret(value: string, applied: string[]): string {
  if (/\^\^/.test(value)) {
    applied.push('double-caret');
    return value.replace(/\^\^+/g, '^');
  }
  return value;
}

function fixExponentBraces(value: string, applied: string[]): string {
  // x^12 -> x^{12}, x^-2 -> x^{-2}. Only when ^ not already followed by {.
  // Run globally but conservatively (base must be word char, ) ] }).
  let out = value;
  const r1 = /([\w)\]}])\^([0-9]{2,})/g;
  if (r1.test(out)) {
    out = out.replace(/([\w)\]}])\^([0-9]{2,})/g, '$1^{$2}');
    applied.push('exp-brace-multi');
  }
  const r2 = /([\w)\]}])\^([-+][0-9A-Za-z]+)/g;
  if (r2.test(out)) {
    // avoid double-wrapping ^{...} already
    out = out.replace(/([\w)\]}])\^([-+][0-9A-Za-z]+)(?!\})/g, (m, b, e) => `${b}^{${e}}`);
    applied.push('exp-brace-sign');
  }
  return out;
}

function fixTextZone(text: string, applied: string[]): string {
  let out = text;
  for (const [re, to] of VI_TYPO) {
    if (re.test(out)) {
      out = out.replace(re, to);
      applied.push(`typo:${to.slice(0, 12)}`);
    }
  }
  // f x -> f(x) when trigger "hàm số" nearby (within 30 chars before)
  // Do sentence-level check: if contains "hàm số" and bare "f x"
  if (/hàm số/i.test(out) && /\bf\s+x\b/.test(out)) {
    out = out.replace(/\b([fgh])\s+x\b/g, '$1(x)');
    applied.push('f-x-to-fx');
  }
  // y = f(x) bare -> $y = f(x)$ (only wrap the equation fragment, not whole sentence)
  // Avoid double-wrap: only on text zone (no $ here by construction).
  if (/\by\s*=\s*f\s*\([^()\n]{1,40}\)/.test(out)) {
    out = out.replace(/\by\s*=\s*f\s*\([^()\n]{1,40}\)/g, (m) => `$${m.trim()}$`);
    applied.push('wrap-y-fx');
  }
  // y = x^... / y = x²(converted to ^) bare -> wrap
  // Tail restricted to ASCII math chars only (never swallow Vietnamese).
  // Must contain ^. Greedy tail may still catch the first letter of a
  // following Vietnamese word ("d có" -> "d c"); shrink it back by
  // looking at the character that follows in the original string.
  const Y_EXP = /\by\s*=\s*[A-Za-z0-9(\\][A-Za-z0-9\s+\-*/^=().,'_|\\{}\[\]]{0,40}\^[A-Za-z0-9\s+\-*/^=().,'_|\\{}\[\]]{1,20}/g;
  if (Y_EXP.test(out)) {
    Y_EXP.lastIndex = 0;
    out = out.replace(Y_EXP, (m, offset: number, full: string) => {
      let clean = m;
      let trail = '';
      for (let guard = 0; guard < 5; guard += 1) {
        const wm = clean.match(/([,;]?\s+)([A-Za-zÀ-ỹ]+)$/);
        if (!wm) break;
        const afterClean = full[offset + clean.length];
        if (afterClean && /[A-Za-zÀ-ỹ]/.test(afterClean)) {
          trail = clean.slice(clean.length - wm[0].length) + trail;
          clean = clean.slice(0, clean.length - wm[0].length);
        } else break;
      }
      const stripped = clean.replace(/[,.;:\s]+$/, '');
      trail = clean.slice(stripped.length) + trail;
      clean = stripped;
      return `$${clean.trim()}$${trail}`;
    });
    applied.push('wrap-y-exp');
  }
  // sin x = ... / cos x = ... bare equation -> wrap with backslash form
  // Tail restricted to math chars only (avoid swallowing Vietnamese "là").
  const trigBare = /\b(sin|cos|tan|cot|log|ln)\s+x\s*=\s*[-+.,0-9x\s^()/\\]+/gi;
  if (trigBare.test(out)) {
    out = out.replace(/\b(sin|cos|tan|cot|log|ln)\s+x\s*=\s*[-+.,0-9x\s^()/\\]+/gi, (m) => {
      const trail = m.match(/\s+$/)?.[0] ?? '';
      const fixed = m.replace(/\b(sin|cos|tan|cot|log|ln)\b/i, (k) => `\\${k.toLowerCase()}`);
      return `$${fixed.trim()}$${trail}`;
    });
    applied.push('wrap-trig-eq');
  }
  return out;
}

function fixMathZone(math: string, applied: string[]): string {
  let out = math;
  // \lim without backslash (handle lim_ / lim( / lim + space)
  if (/(?<!\\)\blim(?=[_({\s])/.test(out)) {
    out = out.replace(/(?<!\\)\blim(?=[_({\s])/g, '\\lim');
    applied.push('math-lim');
  }
  // trig/log without backslash, only when followed by math-ish char
  const trig = /(?<!\\)\b(sin|cos|tan|cot|log|ln|lg)\b(?=[\s({\[^_0-9a-zA-Z])/g;
  if (trig.test(out)) {
    out = out.replace(/(?<!\\)\b(sin|cos|tan|cot|log|ln|lg)\b(?=[\s({\[^_0-9a-zA-Z])/g, '\\$1');
    applied.push('math-trig');
  }
  // sqrt(x) -> \sqrt{x}
  if (/(?<!\\)\bsqrt\s*\(/.test(out)) {
    out = out.replace(/(?<!\\)\bsqrt\s*\(([^()]+)\)/g, '\\sqrt{$1}');
    applied.push('math-sqrt');
  }
  // x -> operator in lim context: "x->0" -> "x \to 0"
  if (/\\lim[^$]*x\s*->/.test(out)) {
    out = out.replace(/(\\lim[^$]*?x)\s*->\s*/g, '$1 \\to ');
    applied.push('math-lim-to');
  }
  return out;
}

export function normalizeMathV2(value: string): { normalized: string; applied: string[] } {
  const applied: string[] = [];
  if (!value) return { normalized: value, applied };

  let working = decodeEntities(value, applied);
  working = fixSupTags(working, applied);
  working = fixUnicodeSup(working, applied);
  working = fixDoubleCaret(working, applied);
  working = fixCaretSpacing(working, applied);
  working = fixExponentBraces(working, applied);

  // Split into math segments vs text, fix each zone.
  const { segments } = extractMathSegments(working);
  if (segments.length === 0) {
    working = fixTextZone(working, applied);
  } else {
    let result = '';
    let cursor = 0;
    for (const seg of segments) {
      const textPart = working.slice(cursor, seg.start);
      result += fixTextZone(textPart, applied);
      const inner = working.slice(seg.start + (seg.display ? 2 : 1), seg.end - (seg.display ? 2 : 1));
      const fixedInner = fixMathZone(inner, applied);
      const delim = seg.display ? '$$' : '$';
      result += `${delim}${fixedInner}${delim}`;
      cursor = seg.end;
    }
    result += fixTextZone(working.slice(cursor), applied);
    working = result;
  }

  const finalNormalized = normalizeMathContent(working);
  // Safety net: never turn valid content into invalid content.
  // Regressions are left untouched for manual review instead.
  if (applied.length > 0) {
    try {
      const before = validateMathContent(value);
      const after = validateMathContent(finalNormalized);
      if (before.valid && !after.valid) {
        return { normalized: value, applied: [] };
      }
    } catch {
      return { normalized: value, applied: [] };
    }
  }
  return { normalized: finalNormalized, applied: [...new Set(applied)] };
}
