import katex from 'katex';

export const MATH_CONTENT_FORMAT_VERSION = 2 as const;

export type MathContentIssue = {
  code:
    | 'UNCLOSED_MATH_DELIMITER'
    | 'NEWLINE_IN_INLINE_MATH'
    | 'TEX_OUTSIDE_MATH'
    | 'KATEX_PARSE_ERROR'
    | 'UNSAFE_HTML_TAG'
    | 'UNSAFE_HTML_ATTRIBUTE';
  message: string;
  severity: 'error' | 'warning';
  offset: number;
};

export type MathContentSegment = {
  value: string;
  display: boolean;
  start: number;
  end: number;
};

const ALLOWED_HTML_TAGS = new Set([
  'table',
  'thead',
  'tbody',
  'tfoot',
  'tr',
  'th',
  'td',
  'br',
  'sub',
  'sup',
]);

const ALLOWED_HTML_ATTRIBUTES = new Set(['colspan', 'rowspan', 'scope']);
const TEX_COMMAND = /\\[A-Za-z]+/g;
const HTML_TAG = /<\/?([A-Za-z][A-Za-z0-9-]*)(\s[^<>]*?)?\s*\/?>/g;
const HTML_ATTRIBUTE = /([A-Za-z_:][-A-Za-z0-9_:.]*)\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/g;

function isEscaped(value: string, index: number) {
  let backslashes = 0;
  for (let cursor = index - 1; cursor >= 0 && value[cursor] === '\\'; cursor -= 1) {
    backslashes += 1;
  }
  return backslashes % 2 === 1;
}

function findClosingDelimiter(
  value: string,
  start: number,
  delimiter: '$' | '$$',
) {
  for (let cursor = start; cursor < value.length; cursor += 1) {
    if (delimiter === '$' && value[cursor] === '\n') return -2;
    if (
      value.startsWith(delimiter, cursor) &&
      !isEscaped(value, cursor) &&
      (delimiter === '$$' || value[cursor + 1] !== '$')
    ) {
      return cursor;
    }
  }
  return -1;
}

export function extractMathSegments(value: string) {
  const segments: MathContentSegment[] = [];
  const issues: MathContentIssue[] = [];
  const textRanges: Array<{ start: number; end: number }> = [];
  let cursor = 0;
  let textStart = 0;

  while (cursor < value.length) {
    if (value[cursor] !== '$' || isEscaped(value, cursor)) {
      cursor += 1;
      continue;
    }

    const delimiter: '$' | '$$' = value.startsWith('$$', cursor) ? '$$' : '$';
    if (cursor > textStart) textRanges.push({ start: textStart, end: cursor });
    const contentStart = cursor + delimiter.length;
    const closing = findClosingDelimiter(value, contentStart, delimiter);

    if (closing < 0) {
      issues.push({
        code: closing === -2 ? 'NEWLINE_IN_INLINE_MATH' : 'UNCLOSED_MATH_DELIMITER',
        message:
          closing === -2
            ? 'Công thức inline không được chứa ký tự xuống dòng.'
            : `Thiếu delimiter đóng ${delimiter}.`,
        severity: 'error',
        offset: cursor,
      });
      textRanges.push({ start: cursor, end: value.length });
      textStart = value.length;
      break;
    }

    segments.push({
      value: value.slice(contentStart, closing),
      display: delimiter === '$$',
      start: cursor,
      end: closing + delimiter.length,
    });
    cursor = closing + delimiter.length;
    textStart = cursor;
  }

  if (textStart < value.length) textRanges.push({ start: textStart, end: value.length });

  for (const range of textRanges) {
    const text = value.slice(range.start, range.end);
    for (const match of text.matchAll(TEX_COMMAND)) {
      const commandOffset = range.start + (match.index ?? 0);
      if (match[0] === '\\$') continue;
      issues.push({
        code: 'TEX_OUTSIDE_MATH',
        message: `Lệnh ${match[0]} phải nằm trong delimiter Toán.`,
        severity: 'error',
        offset: commandOffset,
      });
    }
  }

  return { segments, issues };
}

function validateHtml(value: string): MathContentIssue[] {
  const issues: MathContentIssue[] = [];
  for (const match of value.matchAll(HTML_TAG)) {
    const tag = match[1].toLowerCase();
    if (!ALLOWED_HTML_TAGS.has(tag)) {
      issues.push({
        code: 'UNSAFE_HTML_TAG',
        message: `Thẻ HTML <${tag}> không nằm trong allowlist.`,
        severity: 'error',
        offset: match.index ?? 0,
      });
      continue;
    }

    const attributes = match[2] ?? '';
    for (const attribute of attributes.matchAll(HTML_ATTRIBUTE)) {
      const name = attribute[1].toLowerCase();
      if (!ALLOWED_HTML_ATTRIBUTES.has(name)) {
        issues.push({
          code: 'UNSAFE_HTML_ATTRIBUTE',
          message: `Thuộc tính HTML ${name} sẽ bị loại bỏ.`,
          severity: 'warning',
          offset: (match.index ?? 0) + (attribute.index ?? 0),
        });
      }
    }
  }
  return issues;
}

function stripUnsafeHtmlAttributes(value: string) {
  return value.replace(HTML_TAG, (raw, rawTag: string, rawAttributes = '') => {
    const tag = rawTag.toLowerCase();
    if (!ALLOWED_HTML_TAGS.has(tag)) return raw;
    const closing = raw.startsWith('</');
    if (closing) return `</${tag}>`;
    const selfClosing = raw.endsWith('/>');
    const attributes = [...rawAttributes.matchAll(HTML_ATTRIBUTE)]
      .filter((match) => ALLOWED_HTML_ATTRIBUTES.has(match[1].toLowerCase()))
      .map((match) => match[0])
      .join(' ');
    return `<${tag}${attributes ? ` ${attributes}` : ''}${selfClosing ? ' /' : ''}>`;
  });
}

export function normalizeMathContent(value: string) {
  const normalizedDelimiters = value
    .replace(/\r\n?/g, '\n')
    .replace(/\\\[([\s\S]*?)\\\]/g, (_match, expression: string) => `$$${expression}$$`)
    .replace(/\\\(([^\n]*?)\\\)/g, (_match, expression: string) => `$${expression}$`)
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return stripUnsafeHtmlAttributes(normalizedDelimiters);
}

export function validateMathContent(value: string) {
  const normalized = normalizeMathContent(value);
  const parsed = extractMathSegments(normalized);
  const issues = [...parsed.issues, ...validateHtml(normalized)];

  for (const segment of parsed.segments) {
    try {
      katex.renderToString(segment.value, {
        displayMode: segment.display,
        throwOnError: true,
        trust: false,
        strict: 'error',
        maxExpand: 1000,
        maxSize: 20,
        output: 'htmlAndMathml',
      });
    } catch (error) {
      issues.push({
        code: 'KATEX_PARSE_ERROR',
        message: error instanceof Error ? error.message : 'Công thức KaTeX không hợp lệ.',
        severity: 'error',
        offset: segment.start,
      });
    }
  }

  return {
    normalized,
    segments: parsed.segments,
    issues: issues.sort((left, right) => left.offset - right.offset),
    valid: !issues.some((issue) => issue.severity === 'error'),
  };
}

