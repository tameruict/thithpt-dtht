import { describe, expect, it } from 'vitest';
import { normalizeShortAnswer, serializeShortAnswerForScoring } from './QuestionRenderer';

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
