import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { syncRequestCookies } from './proxy';

describe('syncRequestCookies', () => {
  it('forwards refreshed cookies to the Server Component request', () => {
    const request = new NextRequest('https://example.test/purchase', {
      headers: { cookie: 'old=1' },
    });
    request.cookies.set('sb-ref-auth-token.0', 'refreshed');
    const requestHeaders = new Headers(request.headers);

    syncRequestCookies(request, requestHeaders);

    expect(requestHeaders.get('cookie')).toContain(
      'sb-ref-auth-token.0=refreshed',
    );
  });
});
