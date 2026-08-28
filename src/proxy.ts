import { type NextRequest, NextResponse } from 'next/server';
import { updateSession } from '@/lib/supabase/proxy';

/**
 * Protected routes that require authentication.
 * Users not logged in will be redirected to the login page.
 */
const PROTECTED_ROUTES = [
  '/subjects',
  '/exam',
  '/result',
  '/profile',
  '/room-key',
  '/join',
  '/practice',
  '/purchase',
];

/**
 * Admin routes. Authorization is enforced again at the page/DAL and mutation
 * boundary; Proxy performs only an optimistic cookie check.
 * but we still redirect unauthenticated users here.
 */
const STAFF_ROUTES = ['/admin'];

export function isProtectedRoute(pathname: string) {
  return [...PROTECTED_ROUTES, ...STAFF_ROUTES].some(
    (route) => pathname === route || pathname.startsWith(route + '/'),
  );
}

export function buildContentSecurityPolicy(nonce: string) {
  const isDevelopment = process.env.NODE_ENV === 'development';
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https://challenges.cloudflare.com${isDevelopment ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data: https:",
    "font-src 'self' data:",
    "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://challenges.cloudflare.com" +
      (isDevelopment ? ' http://localhost:* ws://localhost:*' : ''),
    'frame-src https://challenges.cloudflare.com',
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    'upgrade-insecure-requests',
  ].join('; ');
}

function applySecurityHeaders(response: NextResponse, csp: string) {
  response.headers.set('Content-Security-Policy', csp);
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), payment=()',
  );
  response.headers.set('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
  if (process.env.NODE_ENV === 'production') {
    response.headers.set(
      'Strict-Transport-Security',
      'max-age=31536000; includeSubDomains',
    );
  }
  return response;
}

/**
 * Detects a Supabase session cookie set by @supabase/ssr.
 *
 * Large session cookies are split into chunks named `sb-<ref>-auth-token.0`,
 * `.1`, ... (see createChunks in @supabase/ssr). Google sign-ins carry richer
 * user_metadata (name, avatar, ...) so their session cookie exceeds the
 * 3180-byte chunk threshold and gets chunked, while smaller email/password
 * sessions stay unchunked. Matching only the exact `-auth-token` suffix misses
 * the chunked variant, which made Google logins bounce back to `/` in a
 * redirect loop. We match both the base name and its `.N` chunks, but not the
 * transient `-auth-token-code-verifier` cookie used only during the handshake.
 */
export function isSupabaseAuthCookie(name: string) {
  return name.startsWith('sb-') && /-auth-token(\.\d+)?$/.test(name);
}

export async function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const contentSecurityPolicy = buildContentSecurityPolicy(nonce);
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', contentSecurityPolicy);

  // Refresh only; authorization remains close to the data source.
  const response = await updateSession(request, requestHeaders);

  const { pathname } = request.nextUrl;

  // Check if the route requires authentication
  const isProtected = isProtectedRoute(pathname);

  if (isProtected) {
    // Check for Supabase auth cookies to determine if user is logged in.
    // The actual auth verification happens server-side via getUser(),
    // but we can do a quick cookie check here to avoid unnecessary redirects.
    const hasAuthCookie = request.cookies
      .getAll()
      .some((cookie) => isSupabaseAuthCookie(cookie.name));

    if (!hasAuthCookie) {
      const loginUrl = new URL('/', request.url);
      loginUrl.searchParams.set('redirect', pathname);
      return applySecurityHeaders(
        NextResponse.redirect(loginUrl),
        contentSecurityPolicy,
      );
    }
  }

  return applySecurityHeaders(response, contentSecurityPolicy);
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
