import { describe, expect, it } from 'vitest';
import { translateAuthError } from './auth-errors';

describe('OAuth error translation', () => {
  it('explains a reused Google flow state and asks for a fresh login', () => {
    expect(translateAuthError('flow_state_already_used')).toContain('thử lại');
    expect(translateAuthError('State has already been used')).toContain('Google');
  });
});
