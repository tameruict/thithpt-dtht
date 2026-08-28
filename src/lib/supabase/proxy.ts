import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { getSupabaseEnv, hasSupabaseEnv } from './env';
import type { Database } from './database';

export function syncRequestCookies(request: NextRequest, requestHeaders: Headers) {
  requestHeaders.set('cookie', request.cookies.toString());
}

export async function updateSession(
  request: NextRequest,
  requestHeaders = new Headers(request.headers),
) {
  if (!hasSupabaseEnv()) {
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  const { supabaseUrl, supabasePublishableKey } = getSupabaseEnv();
  let supabaseResponse = NextResponse.next({
    request: { headers: requestHeaders },
  });

  const supabase = createServerClient<Database>(
    supabaseUrl,
    supabasePublishableKey,
    {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headersToSet) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });

        // Keep the refreshed cookie jar in the request forwarded to the
        // Server Component. Passing only the original Headers object leaves
        // the component with the expired token, so pages/actions can report
        // NOT_AUTHENTICATED immediately after a session refresh.
        syncRequestCookies(request, requestHeaders);

        supabaseResponse = NextResponse.next({
          request: { headers: requestHeaders },
        });

        cookiesToSet.forEach(({ name, value, options }) => {
          supabaseResponse.cookies.set(name, value, options);
        });

        Object.entries(headersToSet).forEach(([name, value]) => {
          supabaseResponse.headers.set(name, value);
        });
      },
    },
    },
  );

  try {
    await supabase.auth.getClaims();
  } catch {
    // Keep public pages available if auth refresh cannot reach Supabase.
  }

  return supabaseResponse;
}
