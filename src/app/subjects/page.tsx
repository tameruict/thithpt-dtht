import { requireUser } from '@/lib/supabase/session';
import { loadCandidateProfile } from '@/lib/supabase/user-profile';
import type { CandidateInfo } from '@/store/useExamStore';
import SubjectsClient from './SubjectsClient';

export const dynamic = 'force-dynamic';

export default async function SubjectsPage() {
  const { supabase, user } = await requireUser();
  const profile = await loadCandidateProfile(supabase, user);
  const candidate: CandidateInfo = {
    code: profile.code,
    name: profile.name,
    school: profile.school,
    dob: profile.dob,
    gender: profile.gender,
    province: profile.province,
    district: profile.district,
    phone: profile.phone,
    session: null,
  };

  return <SubjectsClient initialCandidate={candidate} />;
}
