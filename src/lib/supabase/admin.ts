import 'server-only';

import { cache } from 'react';
import { redirect } from 'next/navigation';
import { createClient } from './server';

/** Secure DAL boundary for every admin page and Server Action. */
export const requireAdmin = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    redirect('/');
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();

  if (profileError || profile?.role !== 'admin') {
    redirect('/subjects');
  }

  return { supabase, user };
});
