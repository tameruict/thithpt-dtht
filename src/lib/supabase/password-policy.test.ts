import { describe, expect, it } from 'vitest';
import { getPasswordPolicyError } from './password-policy';

describe('getPasswordPolicyError', () => {
  it('requires ten characters', () => {
    expect(getPasswordPolicyError('Abc123')).toContain('10');
  });

  it('requires both a letter and a digit', () => {
    expect(getPasswordPolicyError('abcdefghijk')).toContain('chữ số');
    expect(getPasswordPolicyError('12345678901')).toContain('chữ cái');
  });

  it('accepts a compliant password', () => {
    expect(getPasswordPolicyError('MatKhau2026')).toBeNull();
  });
});
