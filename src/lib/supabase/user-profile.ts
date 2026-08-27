import type { User } from '@supabase/supabase-js';
import type { AppSupabaseClient, Database } from './database';

export type CandidateProfile = {
  code: string;
  email: string;
  name: string;
  school: string;
  dob: string;
  gender: string;
  province: string;
  district: string;
  phone: string;
};

export type StudentProfileInput = {
  fullName: string;
  schoolName?: string;
  dateOfBirth?: string | null;
  gender?: string | null;
  provinceName?: string;
  districtName?: string;
  phone?: string;
};

type SupabaseErrorLike = {
  code?: string;
  message?: string;
};

function fallbackName(user: User) {
  const metadataName = user.user_metadata?.full_name;

  if (typeof metadataName === 'string' && metadataName.trim()) {
    return metadataName.trim();
  }

  return user.email?.split('@')[0] ?? 'Thi sinh';
}

function optionalText(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function optionalDate(value: string | null | undefined) {
  return value ? value : null;
}

function optionalGender(value: string | null | undefined) {
  return value === 'male' || value === 'female' || value === 'other'
    ? value
    : null;
}

function resolveProfileInput(input: string | StudentProfileInput): StudentProfileInput {
  return typeof input === 'string' ? { fullName: input } : input;
}

export async function loadCandidateProfile(
  supabase: AppSupabaseClient,
  user: User,
): Promise<CandidateProfile> {
  const [profileResult, studentResult] = await Promise.all([
    supabase
      .from('profiles')
      .select('email, full_name')
      .eq('id', user.id)
      .maybeSingle(),
    supabase
      .from('students')
      .select(
        'full_name, school_name, date_of_birth, gender, province_name, district_name, phone',
      )
      .eq('id', user.id)
      .maybeSingle(),
  ]);

  const profile = profileResult.data as
    | { email: string | null; full_name: string | null }
    | null;
  const student = studentResult.data as
    | {
        full_name: string | null;
        school_name: string | null;
        date_of_birth: string | null;
        gender: string | null;
        province_name: string | null;
        district_name: string | null;
        phone: string | null;
      }
    | null;

  return {
    code: user.id.slice(0, 8).toUpperCase(),
    email: user.email ?? profile?.email ?? '',
    name: student?.full_name ?? profile?.full_name ?? fallbackName(user),
    school: student?.school_name ?? '',
    dob: student?.date_of_birth ?? '',
    gender: student?.gender ?? '',
    province: student?.province_name ?? '',
    district: student?.district_name ?? '',
    phone: student?.phone ?? '',
  };
}

export async function ensureStudentProfile(
  supabase: AppSupabaseClient,
  user: User,
  profileInput: string | StudentProfileInput,
) {
  const email = user.email;
  const profile = resolveProfileInput(profileInput);
  const fullName = profile.fullName.trim();

  if (!email || !fullName) {
    return;
  }

  // Bước 1: Chỉ INSERT nếu profile chưa tồn tại.
  // ignoreDuplicates: true đảm bảo không overwrite role (admin sẽ không bị
  // downgrade thành student khi tạo hoặc cập nhật profile).
  const { error: insertError } = await supabase.from('profiles').upsert(
    {
      id: user.id,
      email,
      full_name: fullName,
      role: 'student',
    },
    { onConflict: 'id', ignoreDuplicates: true },
  );

  if (insertError) {
    throw insertError;
  }

  // Bước 2: Cập nhật chỉ full_name và email — KHÔNG cập nhật role.
  const { error: updateError } = await supabase
    .from('profiles')
    .update({ full_name: fullName, email })
    .eq('id', user.id);

  if (updateError) {
    throw updateError;
  }

  const studentPayload: Database['public']['Tables']['students']['Insert'] = {
    id: user.id,
    full_name: fullName,
  };

  if ('schoolName' in profile) {
    studentPayload.school_name = optionalText(profile.schoolName);
  }

  if ('dateOfBirth' in profile) {
    studentPayload.date_of_birth = optionalDate(profile.dateOfBirth);
  }

  if ('gender' in profile) {
    studentPayload.gender = optionalGender(profile.gender);
  }

  if ('provinceName' in profile) {
    studentPayload.province_name = optionalText(profile.provinceName);
  }

  if ('districtName' in profile) {
    studentPayload.district_name = optionalText(profile.districtName);
  }

  if ('phone' in profile) {
    studentPayload.phone = optionalText(profile.phone);
  }

  const { error: studentError } = await supabase
    .from('students')
    .upsert(studentPayload, { onConflict: 'id' });

  if (studentError && (studentError as SupabaseErrorLike).code !== '23505') {
    throw studentError;
  }
}

export async function saveCandidateProfile(
  supabase: AppSupabaseClient,
  user: User,
  profile: StudentProfileInput,
) {
  await ensureStudentProfile(supabase, user, profile);
  return loadCandidateProfile(supabase, user);
}
