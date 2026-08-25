import { describe, expect, it } from 'vitest';
import { buildContentSecurityPolicy, isSupabaseAuthCookie } from './proxy';

const REF = 'eskgjwzcognziachvcbl';

describe('isSupabaseAuthCookie', () => {
  it('matches the unchunked session cookie (email/password sessions)', () => {
    expect(isSupabaseAuthCookie(`sb-${REF}-auth-token`)).toBe(true);
  });

  it('matches chunked session cookies (Google sessions exceed the 3180-byte threshold)', () => {
    // Regression: chunked cookies are named `<base>.0`, `.1`, ... — the previous
    // endsWith('-auth-token') check missed these, looping Google logins back to `/`.
    expect(isSupabaseAuthCookie(`sb-${REF}-auth-token.0`)).toBe(true);
    expect(isSupabaseAuthCookie(`sb-${REF}-auth-token.1`)).toBe(true);
    expect(isSupabaseAuthCookie(`sb-${REF}-auth-token.12`)).toBe(true);
  });

  it('ignores the transient PKCE code-verifier cookie', () => {
    expect(isSupabaseAuthCookie(`sb-${REF}-auth-token-code-verifier`)).toBe(false);
  });

  it('ignores unrelated cookies', () => {
    expect(isSupabaseAuthCookie('theme')).toBe(false);
    expect(isSupabaseAuthCookie('sb-something-else')).toBe(false);
    expect(isSupabaseAuthCookie('my-auth-token')).toBe(false);
  });
});

describe('buildContentSecurityPolicy', () => {
  it('binds scripts to the request nonce and blocks framing/objects', () => {
    const policy = buildContentSecurityPolicy('nonce-value');

    expect(policy).toContain("'nonce-nonce-value'");
    expect(policy).toContain("object-src 'none'");
    expect(policy).toContain("frame-ancestors 'none'");
    expect(policy).toContain('https://*.supabase.co');
  });
});
