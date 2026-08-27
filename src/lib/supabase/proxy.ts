import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { getSupabaseEnv, hasSupabaseEnv } from './env';
import type { Database } from './database';

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
