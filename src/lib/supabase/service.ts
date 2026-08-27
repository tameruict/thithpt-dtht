import 'server-only';

import { createClient } from '@supabase/supabase-js';
import type { Database, AppSupabaseClient } from './database';
import { getSupabaseEnv } from './env';

export function getSupabaseSecretKey() {
  const secretKey = process.env.SUPABASE_SECRET_KEY?.trim();
  if (!secretKey) {
    throw new Error('SUPABASE_SECRET_KEY is required for server operations.');
  }
  return secretKey;
}

export function createServiceClient(): AppSupabaseClient {
  const { supabaseUrl } = getSupabaseEnv();
  return createClient<Database>(supabaseUrl, getSupabaseSecretKey(), {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
}
