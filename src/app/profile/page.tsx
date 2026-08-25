'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { hasSupabaseEnv } from '@/lib/supabase/env';
import {
  loadCandidateProfile,
  saveCandidateProfile,
} from '@/lib/supabase/user-profile';
import { useExamStore } from '@/store/useExamStore';
import { formatHanoiDateTime, hanoiTodayInputValue } from '@/lib/datetime';
import styles from '@/styles/profile.module.css';

type StoreState = ReturnType<typeof useExamStore.getState>;
type CandidateInfo = NonNullable<StoreState['candidateInfo']>;

type ProfileFormState = {
  name: string;
  dob: string;
  gender: string;
  school: string;
  province: string;
  district: string;
  phone: string;
};

type ProfileContentProps = {
  candidateInfo: CandidateInfo;
  activeKeys: StoreState['activeKeys'];
  usedKeys: string[];
  examHistory: StoreState['examHistory'];
  purchaseOrders: ProfilePurchaseOrderRecord[];
  updateProfile: StoreState['updateProfile'];
  onBack: () => void;
};

type ProfileKeyRecord = {
  code: string;
  status: string;
  total_attempts: number;
  used_attempts: number;
};

type ProfileSessionRecord = {
  id: string;
  status: string;
  started_at: string;
  submitted_at: string | null;
  score: number | null;
  max_score: number;
  exam_rooms?: { name: string; subject_code: string } | { name: string; subject_code: string }[] | null;
};

type ProfilePurchaseOrderRecord = {
  id: string;
  status: string;
  amount: number;
  currency: string;
  payment_code: string;
  created_at: string;
  fulfilled_at: string | null;
};

const genderOptions = [
  { value: '', label: 'Chá»n giá»›i tÃ­nh' },
  { value: 'male', label: 'Nam' },
  { value: 'female', label: 'Ná»¯' },
  { value: 'other', label: 'KhÃ¡c' },
];

function toDateInputValue(value: string) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }

  const vietnameseDate = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (vietnameseDate) {
    const [, day, month, year] = vietnameseDate;
    return `${year}-${month}-${day}`;
  }

  return '';
}

function toGenderValue(value: string) {
  const normalized = value.trim().toLowerCase();

  if (normalized === 'male' || normalized === 'nam') return 'male';
  if (normalized === 'female' || normalized === 'ná»¯' || normalized === 'nu') {
    return 'female';
  }
  if (normalized === 'other' || normalized === 'khÃ¡c' || normalized === 'khac') {
    return 'other';
  }

  return '';
}

function getInitialForm(candidateInfo: CandidateInfo): ProfileFormState {
  return {
    name: candidateInfo.name || '',
    dob: toDateInputValue(candidateInfo.dob || ''),
    gender: toGenderValue(candidateInfo.gender || ''),
    school: candidateInfo.school || '',
    province: candidateInfo.province || '',
    district: candidateInfo.district || '',
    phone: candidateInfo.phone || '',
  };
}

function firstRelation<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

export default function ProfilePage() {
  const router = useRouter();
  const {
    hasHydrated,
    candidateInfo,
    login,
    updateProfile,
  } = useExamStore();
  const [activeKeys, setActiveKeys] = useState<StoreState['activeKeys']>([]);
  const [usedKeys, setUsedKeys] = useState<string[]>([]);
  const [examHistory, setExamHistory] = useState<StoreState['examHistory']>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<ProfilePurchaseOrderRecord[]>([]);

  useEffect(() => {
    if (hasHydrated && !candidateInfo) {
      router.push('/');
    }
  }, [hasHydrated, candidateInfo, router]);

  useEffect(() => {
    if (!hasHydrated || !hasSupabaseEnv()) return;

    const currentProfile = useExamStore.getState().candidateInfo;
    if (!currentProfile) return;

    let isMounted = true;
    const supabase = createClient();

    supabase.auth
      .getUser()
      .then(async ({ data, error }) => {
        if (!isMounted) return;

        if (error || !data.user) {
          useExamStore.getState().logout();
          router.push('/');
          return;
        }

        const profile = await loadCandidateProfile(supabase, data.user);
        if (!isMounted) return;

        const latestProfile = useExamStore.getState().candidateInfo;
        const profileUnchanged =
          latestProfile?.code === profile.code &&
          latestProfile.name === profile.name &&
          latestProfile.school === profile.school &&
          latestProfile.dob === profile.dob &&
          latestProfile.gender === profile.gender &&
          latestProfile.province === profile.province &&
          latestProfile.district === profile.district &&
          latestProfile.phone === profile.phone;

        if (!profileUnchanged) {
          login(profile.code, {
            name: profile.name,
            school: profile.school,
            dob: profile.dob,
            gender: profile.gender,
            province: profile.province,
            district: profile.district,
            phone: profile.phone,
          });
        }

        const [keyResult, sessionResult, orderResult] = await Promise.all([
          supabase
            .from('exam_keys')
            .select('code,status,total_attempts,used_attempts')
            .eq('assigned_to', data.user.id)
            .order('created_at', { ascending: false }),
          supabase
            .from('exam_sessions')
            .select('id,status,started_at,submitted_at,score,max_score,exam_rooms(name,subject_code)')
            .eq('student_id', data.user.id)
            .order('started_at', { ascending: false })
            .limit(20),
          supabase
            .from('purchase_orders')
            .select('id,status,amount,currency,payment_code,created_at,fulfilled_at')
            .eq('student_id', data.user.id)
            .order('created_at', { ascending: false })
            .limit(20),
        ]);

        if (!isMounted) return;

        const keyRows = (keyResult.data ?? []) as unknown as ProfileKeyRecord[];
        setActiveKeys(
          keyRows
            .filter((key) => {
              const remaining = key.total_attempts - key.used_attempts;
              return ['unused', 'active'].includes(key.status) && remaining > 0;
            })
            .map((key) => ({
              code: key.code,
              remainingAttempts: Math.max(key.total_attempts - key.used_attempts, 0),
            })),
        );
        setUsedKeys(
          keyRows
            .filter((key) => {
              const remaining = key.total_attempts - key.used_attempts;
              return key.status === 'exhausted' || remaining <= 0;
            })
            .map((key) => key.code),
        );

        const sessionRows = (sessionResult.data ?? []) as unknown as ProfileSessionRecord[];
        setPurchaseOrders(
          (orderResult.data ?? []) as unknown as ProfilePurchaseOrderRecord[],
        );
        setExamHistory(
          sessionRows.map((session) => {
            const room = firstRelation(session.exam_rooms);
            const score =
              typeof session.score === 'number'
                ? `${session.score.toFixed(2)} / ${session.max_score}`
                : session.status;

            return {
              id: session.id,
              subject: room?.subject_code ?? 'ChÆ°a rÃµ mÃ´n',
              examSet: room?.name,
              score,
              date: formatHanoiDateTime(
                session.submitted_at ?? session.started_at,
              ),
            };
          }),
        );
      })
      .catch(() => undefined);

    return () => {
      isMounted = false;
    };
  }, [hasHydrated, login, router]);

  if (!hasHydrated || !candidateInfo) return null;

  return (
    <ProfileContent
      key={candidateInfo.code}
      candidateInfo={candidateInfo}
      activeKeys={activeKeys}
      usedKeys={usedKeys}
      examHistory={examHistory}
      purchaseOrders={purchaseOrders}
      updateProfile={updateProfile}
      onBack={() => router.push('/subjects')}
    />
  );
}

function ProfileContent({
  candidateInfo,
  activeKeys,
  usedKeys,
  examHistory,
  purchaseOrders,
  updateProfile,
  onBack,
}: ProfileContentProps) {
  const [draftForm, setDraftForm] = useState<ProfileFormState | null>(null);
  const [status, setStatus] = useState<'idle' | 'saving' | 'success' | 'error'>(
    'idle',
  );
  const [feedback, setFeedback] = useState('');
  const today = hanoiTodayInputValue();
  const form = draftForm ?? getInitialForm(candidateInfo);

  const updateField =
    (field: keyof ProfileFormState) =>
    (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      setDraftForm((currentForm) => ({
        ...(currentForm ?? getInitialForm(candidateInfo)),
        [field]: event.target.value,
      }));
      if (status !== 'idle') {
        setStatus('idle');
        setFeedback('');
      }
    };

  const handleSave = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const fullName = form.name.trim();
    if (!fullName) {
      setStatus('error');
      setFeedback('Vui lÃ²ng nháº­p há» vÃ  tÃªn há»c sinh.');
      return;
    }

    if (!hasSupabaseEnv()) {
      setStatus('error');
      setFeedback('ChÆ°a cáº¥u hÃ¬nh Supabase nÃªn khÃ´ng thá»ƒ lÆ°u há»“ sÆ¡.');
      return;
    }

    setStatus('saving');
    setFeedback('');

    try {
      const supabase = createClient();
      const { data, error: userError } = await supabase.auth.getUser();

      if (!data.user) {
        throw new Error(
          'PhiÃªn Ä‘Äƒng nháº­p Supabase Ä‘Ã£ háº¿t háº¡n. Vui lÃ²ng Ä‘Äƒng nháº­p láº¡i Ä‘á»ƒ lÆ°u há»“ sÆ¡.',
        );
      }

      if (userError) {
        throw userError;
      }

      const profile = await saveCandidateProfile(supabase, data.user, {
        fullName,
        dateOfBirth: form.dob || null,
        gender: form.gender || null,
        schoolName: form.school,
        provinceName: form.province,
        districtName: form.district,
        phone: form.phone,
      });

      updateProfile({
        name: profile.name,
        dob: profile.dob,
        gender: profile.gender,
        school: profile.school,
        province: profile.province,
        district: profile.district,
        phone: profile.phone,
      });
      setDraftForm(null);
      setStatus('success');
      setFeedback('ÄÃ£ lÆ°u thÃ´ng tin vÃ o cÆ¡ sá»Ÿ dá»¯ liá»‡u.');
    } catch (saveError) {
      const message =
        saveError instanceof Error
          ? saveError.message
          : 'KhÃ´ng thá»ƒ lÆ°u há»“ sÆ¡ há»c sinh.';
      setStatus('error');
      setFeedback(message);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>Quáº£n lÃ½ há»“ sÆ¡</h1>
        <button className="btn outline" type="button" onClick={onBack}>
          Quay láº¡i chá»n mÃ´n
        </button>
      </div>

      <div className={styles.grid}>
        <div className={styles.card}>
          <h2 className={styles.sectionTitle}>ThÃ´ng tin há»c sinh</h2>
          <form onSubmit={handleSave}>
            <div className={styles.formGroup}>
              <label className={styles.label}>Sá»‘ bÃ¡o danh / MÃ£ thÃ­ sinh</label>
              <input
                type="text"
                className={styles.input}
                value={candidateInfo.code}
                disabled
              />
            </div>

            <div className={styles.formGroup}>
              <label className={styles.label}>Há» vÃ  tÃªn</label>
              <input
                type="text"
                required
                className={styles.input}
                value={form.name}
                autoComplete="name"
                onChange={updateField('name')}
              />
            </div>

            <div className={styles.formGrid}>
              <div className={styles.formGroup}>
                <label className={styles.label}>NgÃ y sinh</label>
                <input
                  type="date"
                  required
                  max={today}
                  className={styles.input}
                  value={form.dob}
                  onChange={updateField('dob')}
                />
              </div>

              <div className={styles.formGroup}>
                <label className={styles.label}>Giá»›i tÃ­nh</label>
                <select
                  className={styles.input}
                  value={form.gender}
                  onChange={updateField('gender')}
                >
                  {genderOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className={styles.formGroup}>
              <label className={styles.label}>TrÆ°á»ng há»c</label>
              <input
                type="text"
                className={styles.input}
                value={form.school}
                autoComplete="organization"
                onChange={updateField('school')}
              />
            </div>

            <div className={styles.formGrid}>
              <div className={styles.formGroup}>
                <label className={styles.label}>Tá»‰nh / ThÃ nh phá»‘</label>
                <input
                  type="text"
                  className={styles.input}
                  value={form.province}
                  onChange={updateField('province')}
                />
              </div>

              <div className={styles.formGroup}>
                <label className={styles.label}>Quáº­n / Huyá»‡n</label>
                <input
                  type="text"
                  className={styles.input}
                  value={form.district}
                  onChange={updateField('district')}
                />
              </div>
            </div>

            <div className={styles.formGroup}>
              <label className={styles.label}>Sá»‘ Ä‘iá»‡n thoáº¡i</label>
              <input
                type="tel"
                className={styles.input}
                value={form.phone}
                autoComplete="tel"
                onChange={updateField('phone')}
              />
            </div>

            {feedback && (
              <p
                className={`${styles.feedback} ${
                  status === 'error' ? styles.feedbackError : styles.feedbackSuccess
                }`}
              >
                {feedback}
              </p>
            )}

            <button
              type="submit"
              className={`btn ${styles.submitBtn}`}
              disabled={status === 'saving'}
            >
              {status === 'saving' ? 'Äang lÆ°u...' : 'LÆ°u thay Ä‘á»•i'}
            </button>
          </form>
        </div>

        <div className={styles.stack}>
          <div className={styles.card}>
            <h2 className={styles.sectionTitle}>Quáº£n lÃ½ key phÃ²ng thi</h2>

            <h3 className={styles.subsectionTitle}>Äang sá»­ dá»¥ng</h3>
            {activeKeys.length > 0 ? (
              activeKeys.map((key) => (
                <div key={key.code} className={styles.keyStat}>
                  <span className={styles.code}>Key: {key.code}</span>
                  <span className={styles.attempts}>
                    CÃ²n láº¡i: {key.remainingAttempts} lÆ°á»£t
                  </span>
                </div>
              ))
            ) : (
              <div className={styles.emptyState}>KhÃ´ng cÃ³ key nÃ o Ä‘ang dÃ¹ng</div>
            )}

            <h3 className={`${styles.subsectionTitle} ${styles.spaced}`}>
              ÄÃ£ dÃ¹ng háº¿t
            </h3>
            {usedKeys.length > 0 ? (
              usedKeys.map((key) => (
                <div key={key} className={`${styles.keyStat} ${styles.used}`}>
                  <span className={styles.code}>Key: {key}</span>
                  <span className={styles.attempts}>Háº¿t lÆ°á»£t</span>
                </div>
              ))
            ) : (
              <div className={styles.emptyState}>ChÆ°a cÃ³ key nÃ o Ä‘Ã£ dÃ¹ng háº¿t</div>
            )}
          </div>

          <div className={styles.card}>
            <div className={styles.sectionHeader}>
              <div>
                <h2 className={styles.sectionTitle}>Lịch sử mua key</h2>
                <p className={styles.muted}>
                  Key đã mua được dùng cho exam và practice.
                </p>
              </div>
              <Link className="btn outline small" href="/purchase">
                Mua key
              </Link>
            </div>
            {purchaseOrders.length > 0 ? (
              <div className={styles.purchaseList}>
                {purchaseOrders.map((purchase) => (
                  <div className={styles.purchaseRow} key={purchase.id}>
                    <div>
                      <strong>{purchase.payment_code}</strong>
                      <span>{formatHanoiDateTime(purchase.created_at)}</span>
                    </div>
                    <span className={styles.purchaseAmount}>
                      {purchase.amount.toLocaleString('vi-VN')} {purchase.currency}
                    </span>
                    <span className={styles.purchaseStatus}>{purchase.status}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className={styles.emptyState}>Chưa có đơn mua key nào</div>
            )}
          </div>
          <div className={styles.card}>
            <h2 className={styles.sectionTitle}>Lá»‹ch sá»­ bÃ i thi</h2>
            {examHistory.length > 0 ? (
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>MÃ´n thi</th>
                    <th>NgÃ y hoÃ n thÃ nh</th>
                    <th>Äiá»ƒm sá»‘</th>
                  </tr>
                </thead>
                <tbody>
                  {examHistory.map((history) => (
                    <tr key={history.id}>
                      <td>
                        <strong>{history.subject}</strong>
                        {history.examSet ? (
                          <span className={styles.historyExamSet}>
                            {history.examSet}
                          </span>
                        ) : null}
                      </td>
                      <td>{history.date}</td>
                      <td className={styles.historyScore}>{history.score}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className={styles.emptyState}>
                ChÆ°a cÃ³ lá»‹ch sá»­ lÃ m bÃ i nÃ o
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
