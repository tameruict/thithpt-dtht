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
import { maskKey } from '@/lib/device';
import styles from '@/styles/profile.module.css';
import StudentNav from '@/components/ui/StudentNav';

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
  dataStatus: 'loading' | 'ready' | 'error';
  dataError: string;
  onRetryData: () => void;
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
  { value: '', label: 'Chọn giới tính' },
  { value: 'male', label: 'Nam' },
  { value: 'female', label: 'Nữ' },
  { value: 'other', label: 'Khác' },
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
  if (normalized === 'female' || normalized === 'nữ' || normalized === 'nu') {
    return 'female';
  }
  if (normalized === 'other' || normalized === 'khác' || normalized === 'khac') {
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
  const [dataStatus, setDataStatus] = useState<'loading' | 'ready' | 'error'>(
    () => (hasSupabaseEnv() ? 'loading' : 'error'),
  );
  const [dataError, setDataError] = useState(() =>
    hasSupabaseEnv() ? '' : 'Chưa cấu hình Supabase nên không thể tải dữ liệu hồ sơ.',
  );
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (hasHydrated && !candidateInfo) {
      router.push('/');
    }
  }, [hasHydrated, candidateInfo, router]);

  useEffect(() => {
    if (!hasHydrated) return;
    if (!hasSupabaseEnv()) {
      return;
    }

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

        const queryError = keyResult.error ?? sessionResult.error ?? orderResult.error;
        if (queryError) {
          throw queryError;
        }

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
              subject: room?.subject_code ?? 'Chưa rõ môn',
              examSet: room?.name,
              score,
              date: formatHanoiDateTime(
                session.submitted_at ?? session.started_at,
              ),
            };
          }),
        );
        setDataStatus('ready');
      })
      .catch((loadError: unknown) => {
        if (!isMounted) return;
        setDataStatus('error');
        setDataError(
          loadError instanceof Error
            ? loadError.message
            : 'Không thể tải dữ liệu hồ sơ. Vui lòng thử lại.',
        );
      });

    return () => {
      isMounted = false;
    };
  }, [hasHydrated, login, reloadKey, router]);

  if (!hasHydrated || !candidateInfo) {
    return (
      <main id="main" tabIndex={-1} className={styles.loadingState} role="status" aria-live="polite">
        Đang tải hồ sơ thí sinh…
      </main>
    );
  }

  return (
    <ProfileContent
      key={candidateInfo.code}
      candidateInfo={candidateInfo}
      activeKeys={activeKeys}
      usedKeys={usedKeys}
      examHistory={examHistory}
      purchaseOrders={purchaseOrders}
      updateProfile={updateProfile}
      dataStatus={dataStatus}
      dataError={dataError}
      onRetryData={() => setReloadKey((current) => current + 1)}
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
  dataStatus,
  dataError,
  onRetryData,
  onBack,
}: ProfileContentProps) {
  const [draftForm, setDraftForm] = useState<ProfileFormState | null>(null);
  const [revealedKeys, setRevealedKeys] = useState<Set<string>>(new Set());
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
      setFeedback('Vui lòng nhập họ và tên học sinh.');
      return;
    }

    if (!hasSupabaseEnv()) {
      setStatus('error');
      setFeedback('Chưa cấu hình Supabase nên không thể lưu hồ sơ.');
      return;
    }

    setStatus('saving');
    setFeedback('');

    try {
      const supabase = createClient();
      const { data, error: userError } = await supabase.auth.getUser();

      if (!data.user) {
        throw new Error(
          'Phiên đăng nhập Supabase đã hết hạn. Vui lòng đăng nhập lại để lưu hồ sơ.',
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
      setFeedback('Đã lưu thông tin vào cơ sở dữ liệu.');
    } catch (saveError) {
      const message =
        saveError instanceof Error
          ? saveError.message
          : 'Không thể lưu hồ sơ học sinh.';
      setStatus('error');
      setFeedback(message);
    }
  };

  return (
    <div className={styles.container}>
      <StudentNav />
      <header className={styles.header}>
        <h1 className={styles.title}>Quản lý hồ sơ</h1>
        <button className="btn outline" type="button" onClick={onBack}>
          Quay lại chọn môn
        </button>
      </header>

      <main id="main" tabIndex={-1} className={styles.grid} aria-label="Hồ sơ thí sinh">
        {dataStatus === 'error' ? (
          <section className={styles.dataError} role="alert" aria-labelledby="profile-data-error-title">
            <div>
              <h2 id="profile-data-error-title">Không thể tải đầy đủ dữ liệu hồ sơ</h2>
              <p>{dataError}</p>
            </div>
            <button className="btn secondary" type="button" onClick={onRetryData}>
              Thử lại
            </button>
          </section>
        ) : null}
        {dataStatus === 'loading' ? (
          <p className={styles.dataLoading} role="status" aria-live="polite">
            Đang đồng bộ key, lịch sử thi và giao dịch…
          </p>
        ) : null}
        <section className={styles.card} aria-labelledby="profile-info-heading">
          <h2 className={styles.sectionTitle} id="profile-info-heading">Thông tin học sinh</h2>
          <form onSubmit={handleSave}>
            <div className={styles.formGroup}>
              <label className={styles.label} htmlFor="profile-code">Số báo danh / Mã thí sinh</label>
              <input
                id="profile-code"
                name="candidateCode"
                type="text"
                className={styles.input}
                value={candidateInfo.code}
                disabled
                aria-disabled="true"
              />
            </div>

            <div className={styles.formGroup}>
              <label className={styles.label} htmlFor="profile-name">Họ và tên</label>
              <input
                id="profile-name"
                name="fullName"
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
                <label className={styles.label} htmlFor="profile-dob">Ngày sinh</label>
                <input
                  id="profile-dob"
                  name="dob"
                  type="date"
                  required
                  max={today}
                  className={styles.input}
                  value={form.dob}
                  onChange={updateField('dob')}
                />
              </div>

              <div className={styles.formGroup}>
                <label className={styles.label} htmlFor="profile-gender">Giới tính</label>
                <select
                  id="profile-gender"
                  name="gender"
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
              <label className={styles.label} htmlFor="profile-school">Trường học</label>
              <input
                id="profile-school"
                name="school"
                type="text"
                className={styles.input}
                value={form.school}
                autoComplete="organization"
                onChange={updateField('school')}
              />
            </div>

            <div className={styles.formGrid}>
              <div className={styles.formGroup}>
                <label className={styles.label} htmlFor="profile-province">Tỉnh / Thành phố</label>
                <input
                  id="profile-province"
                  name="province"
                  type="text"
                  className={styles.input}
                  value={form.province}
                  autoComplete="address-level1"
                  onChange={updateField('province')}
                />
              </div>

              <div className={styles.formGroup}>
                <label className={styles.label} htmlFor="profile-district">Quận / Huyện</label>
                <input
                  id="profile-district"
                  name="district"
                  type="text"
                  className={styles.input}
                  value={form.district}
                  autoComplete="address-level2"
                  onChange={updateField('district')}
                />
              </div>
            </div>

            <div className={styles.formGroup}>
              <label className={styles.label} htmlFor="profile-phone">Số điện thoại</label>
              <input
                id="profile-phone"
                name="phone"
                type="tel"
                className={styles.input}
                value={form.phone}
                autoComplete="tel"
                inputMode="tel"
                onChange={updateField('phone')}
              />
            </div>

            <div aria-live="polite">
              {feedback && (
                <p
                  role={status === 'error' ? 'alert' : 'status'}
                  className={`${styles.feedback} ${
                    status === 'error' ? styles.feedbackError : styles.feedbackSuccess
                  }`}
                >
                  {feedback}
                </p>
              )}
            </div>

            <button
              type="submit"
              className={`btn ${styles.submitBtn}`}
              disabled={status === 'saving'}
            >
              {status === 'saving' ? 'Đang lưu...' : 'Lưu thay đổi'}
            </button>
          </form>
        </section>

        <div className={styles.stack}>
          <section className={styles.card} aria-labelledby="profile-keys-heading">
            <h2 className={styles.sectionTitle} id="profile-keys-heading">Quản lý key phòng thi</h2>

            <h3 className={styles.subsectionTitle}>Đang sử dụng</h3>
            <p className={styles.muted}>
              Key đã mask để chống chia sẻ. Bấm Hiện để xem, Gia hạn để cộng
              lượt vào key cũ.
            </p>
            {activeKeys.length > 0 ? (
              <ul className={styles.keyList}>
                {activeKeys.map((key) => {
                  const revealed = revealedKeys.has(key.code);
                  return (
                    <li key={key.code} className={styles.keyStat}>
                      <span className={styles.code}>
                        Key: {revealed ? key.code : maskKey(key.code)}
                      </span>
                      <span className={styles.attempts}>
                        Còn lại: {key.remainingAttempts} lượt
                      </span>
                      <span className={styles.keyActions}>
                        <button
                          type="button"
                          className="btn outline small"
                          onClick={() =>
                            setRevealedKeys((prev) => {
                              const next = new Set(prev);
                              if (next.has(key.code)) next.delete(key.code);
                              else next.add(key.code);
                              return next;
                            })
                          }
                        >
                          {revealed ? 'Ẩn' : 'Hiện'}
                        </button>
                        <Link
                          className="btn secondary small"
                          href={`/purchase?topup=${encodeURIComponent(key.code)}`}
                        >
                          Gia hạn
                        </Link>
                      </span>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className={styles.emptyState}>Không có key nào đang dùng</div>
            )}

            <h3 className={`${styles.subsectionTitle} ${styles.spaced}`}>
              Đã dùng hết
            </h3>
            {usedKeys.length > 0 ? (
              <ul className={styles.keyList}>
                {usedKeys.map((key) => (
                  <li key={key} className={`${styles.keyStat} ${styles.used}`}>
                    <span className={styles.code}>Key: {key}</span>
                    <span className={styles.attempts}>Hết lượt</span>
                  </li>
                ))}
              </ul>
            ) : (
              <div className={styles.emptyState}>Chưa có key nào đã dùng hết</div>
            )}
          </section>

          <section className={styles.card} aria-labelledby="profile-orders-heading">
            <div className={styles.sectionHeader}>
              <div>
                <h2 className={styles.sectionTitle} id="profile-orders-heading">Lịch sử mua key</h2>
                <p className={styles.muted}>
                  Key đã mua được dùng cho exam và practice.
                </p>
              </div>
              <Link className="btn outline small" href="/purchase">
                Mua key
              </Link>
            </div>
            {purchaseOrders.length > 0 ? (
              <ul className={styles.purchaseList}>
                {purchaseOrders.map((purchase) => (
                  <li className={styles.purchaseRow} key={purchase.id}>
                    <div>
                      <strong>{purchase.payment_code}</strong>
                      <span>{formatHanoiDateTime(purchase.created_at)}</span>
                    </div>
                    <span className={styles.purchaseAmount}>
                      {purchase.amount.toLocaleString('vi-VN')} {purchase.currency}
                    </span>
                    <span className={styles.purchaseStatus}>{purchase.status}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <div className={styles.emptyState}>Chưa có đơn mua key nào</div>
            )}
          </section>
          <section className={styles.card} aria-labelledby="profile-history-heading">
            <h2 className={styles.sectionTitle} id="profile-history-heading">Lịch sử bài thi</h2>
            {examHistory.length > 0 ? (
              <table className={styles.table}>
                <caption className={styles.visuallyHidden}>Lịch sử các bài thi đã làm</caption>
                <thead>
                  <tr>
                    <th scope="col">Môn thi</th>
                    <th scope="col">Ngày hoàn thành</th>
                    <th scope="col">Điểm số</th>
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
                Chưa có lịch sử làm bài nào
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
