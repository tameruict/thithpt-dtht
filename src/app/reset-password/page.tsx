'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Mail, Lock, KeyRound, Eye, EyeOff, ArrowLeft } from 'lucide-react';
import styles from '@/styles/auth.module.css';
import { createClient } from '@/lib/supabase/client';
import { hasSupabaseEnv } from '@/lib/supabase/env';
import { loadCandidateProfile } from '@/lib/supabase/user-profile';
import { translateAuthError } from '@/lib/supabase/auth-errors';
import {
  getPasswordPolicyError,
  MIN_PASSWORD_LENGTH,
} from '@/lib/supabase/password-policy';
import CaptchaChallenge, {
  turnstileSiteKey,
} from '@/components/auth/CaptchaChallenge';
import { useExamStore } from '@/store/useExamStore';

const RESEND_COOLDOWN = 60;
const OTP_LENGTH = 8;

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const [step, setStep] = useState<'request' | 'verify'>('request');
  // Lấy sẵn email người dùng đã gõ ở màn đăng nhập (?email=...)
  const [email, setEmail] = useState(searchParams.get('email') ?? '');
  const [otp, setOtp] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const router = useRouter();
  const login = useExamStore((state) => state.login);

  // Đếm ngược thời gian được phép gửi lại mã
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setInterval(() => {
      setCooldown((value) => (value <= 1 ? 0 : value - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [cooldown]);

  const sendingRef = useRef(false);

  const sendCode = async (targetEmail: string) => {
    if (sendingRef.current) return;
    sendingRef.current = true;
    setError('');
    setLoading(true);
    try {
      if (turnstileSiteKey && !captchaToken) {
        setError('Vui lòng hoàn tất xác minh chống bot.');
        return false;
      }
      const supabase = createClient();
      // Không truyền redirectTo: dùng luồng mã OTP thay vì link đăng nhập.
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(
        targetEmail,
        { captchaToken: captchaToken ?? undefined },
      );
      if (resetError) {
        setError(translateAuthError(resetError.message));
        return false;
      }
      setStep('verify');
      setMessage(`Đã gửi mã OTP gồm ${OTP_LENGTH} số đến ${targetEmail}. Vui lòng kiểm tra hộp thư (kể cả mục Spam).`);
      setCooldown(RESEND_COOLDOWN);
      return true;
    } finally {
      setLoading(false);
      sendingRef.current = false;
    }
  };

  const handleRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setError('Vui lòng nhập email tài khoản.');
      return;
    }
    if (!hasSupabaseEnv()) {
      setError('Chưa cấu hình Supabase. Hãy thêm .env.local trước khi tiếp tục.');
      return;
    }

    setEmail(trimmedEmail);
    await sendCode(trimmedEmail);
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');

    const code = otp.trim();
    if (code.length !== OTP_LENGTH) {
      setError(`Mã OTP gồm ${OTP_LENGTH} số. Vui lòng nhập đầy đủ.`);
      return;
    }
    const passwordError = getPasswordPolicyError(password);
    if (passwordError) {
      setError(passwordError);
      return;
    }
    if (password !== confirmPassword) {
      setError('Mật khẩu nhập lại không khớp.');
      return;
    }
    if (!hasSupabaseEnv()) {
      setError('Chưa cấu hình Supabase. Hãy thêm .env.local trước khi tiếp tục.');
      return;
    }

    setLoading(true);
    try {
      const supabase = createClient();

      // Bước 1: xác thực mã OTP để mở phiên đặt lại mật khẩu.
      const { error: verifyError } = await supabase.auth.verifyOtp({
        email,
        token: code,
        type: 'recovery',
      });
      if (verifyError) {
        setError(translateAuthError(verifyError.message));
        return;
      }

      // Bước 2: đặt mật khẩu mới (Supabase sẽ tự gửi email "đã đổi mật khẩu").
      const { data, error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) {
        setError(translateAuthError(updateError.message));
        return;
      }

      if (data.user) {
        const profile = await loadCandidateProfile(supabase, data.user);
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

      setMessage('Đổi mật khẩu thành công! Đang chuyển hướng…');
      router.push('/subjects');
    } finally {
      setLoading(false);
    }
  };

  const otpIncomplete = otp.length > 0 && otp.length < OTP_LENGTH;
  const confirmMismatch =
    confirmPassword.length > 0 && password !== confirmPassword;

  return (
    <div className={styles.container}>
      <header className={styles.topbar}>
        <div className={styles.topbarInner}>
          <span className={styles.crest} aria-hidden="true">THPT</span>
          <div>
            <p className={styles.brandTitle}>Kỳ thi tốt nghiệp THPT Quốc gia</p>
            <p className={styles.brandSub}>Khôi phục mật khẩu tài khoản thí sinh</p>
          </div>
        </div>
      </header>

      <div className={styles.cardWrap}>
      <main id="main" tabIndex={-1} className={styles.card}>
        {step === 'request' ? (
          <>
            <h1 className={styles.title}>Quên mật khẩu</h1>
            <p className={styles.subtitle}>
              Nhập email tài khoản. Chúng tôi sẽ gửi <strong>mã OTP {OTP_LENGTH} số</strong> đến hộp thư của bạn để đặt lại mật khẩu.
            </p>

            <form onSubmit={handleRequest}>
              <div className={styles.formGroup}>
                <label className={styles.label} htmlFor="recovery-email">Email <span className={styles.required}>*</span></label>
                <div className={styles.inputWrapper}>
                  <Mail className={styles.inputIcon} />
                  <input
                    id="recovery-email"
                    type="email"
                    required
                    className={styles.input}
                    value={email}
                    placeholder="nhap-email@example.com"
                    autoComplete="email"
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
              </div>

              <CaptchaChallenge onToken={setCaptchaToken} />
              {error && <p className={styles.errorText} role="alert" aria-live="assertive">{error}</p>}

              <button type="submit" className={styles.submitBtn} disabled={loading} aria-busy={loading}>
                {loading ? 'Đang gửi…' : 'Gửi mã OTP'}
              </button>
            </form>
          </>
        ) : (
          <>
            <h1 className={styles.title}>Đặt lại mật khẩu</h1>
            <p className={styles.subtitle}>
              Nhập mã OTP đã gửi đến <strong>{email}</strong> cùng mật khẩu mới của bạn.
            </p>

            <form onSubmit={handleVerify}>
              <div className={styles.formGroup}>
                <label className={styles.label} htmlFor="recovery-otp">Mã OTP <span className={styles.required}>*</span></label>
                <div className={styles.inputWrapper}>
                  <KeyRound className={styles.inputIcon} />
                  <input
                    id="recovery-otp"
                    type="text"
                    required
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={OTP_LENGTH}
                    className={styles.input}
                    value={otp}
                    placeholder={`${OTP_LENGTH} số`}
                    aria-invalid={otpIncomplete}
                    aria-describedby={otpIncomplete ? 'recovery-otp-error' : undefined}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, OTP_LENGTH))}
                  />
                </div>
                {otpIncomplete ? (
                  <p id="recovery-otp-error" className={styles.fieldError} role="alert">
                    Mã OTP gồm {OTP_LENGTH} số, còn thiếu {OTP_LENGTH - otp.length} số.
                  </p>
                ) : null}
              </div>

              <div className={styles.formGroup}>
                <label className={styles.label} htmlFor="recovery-password">Mật khẩu mới <span className={styles.required}>*</span></label>
                <div className={styles.inputWrapper}>
                  <Lock className={styles.inputIcon} />
                  <input
                    id="recovery-password"
                    type={showPassword ? 'text' : 'password'}
                    required
                    minLength={MIN_PASSWORD_LENGTH}
                    className={styles.input}
                    value={password}
                    placeholder={`Tối thiểu ${MIN_PASSWORD_LENGTH} ký tự, gồm chữ và số`}
                    autoComplete="new-password"
                    aria-describedby="recovery-password-hint"
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <button
                    type="button"
                    className={styles.inputRightIcon}
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
                <p id="recovery-password-hint" className={styles.fieldHint}>Tối thiểu {MIN_PASSWORD_LENGTH} ký tự.</p>
              </div>

              <div className={styles.formGroup}>
                <label className={styles.label} htmlFor="recovery-password-confirm">Nhập lại mật khẩu <span className={styles.required}>*</span></label>
                <div className={styles.inputWrapper}>
                  <Lock className={styles.inputIcon} />
                  <input
                    id="recovery-password-confirm"
                    type={showPassword ? 'text' : 'password'}
                    required
                    className={styles.input}
                    value={confirmPassword}
                    placeholder="Nhập lại mật khẩu mới"
                    autoComplete="new-password"
                    aria-invalid={confirmMismatch}
                    aria-describedby={confirmMismatch ? 'recovery-confirm-error' : undefined}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                  />
                </div>
                {confirmMismatch ? (
                  <p id="recovery-confirm-error" className={styles.fieldError} role="alert">
                    Mật khẩu nhập lại chưa khớp.
                  </p>
                ) : null}
              </div>

              {error && <p className={styles.errorText} role="alert" aria-live="assertive">{error}</p>}
              {message && (
                <p className={`${styles.errorText} ${styles.successText}`} role="status" aria-live="polite">
                  {message}
                </p>
              )}

              <button type="submit" className={styles.submitBtn} disabled={loading} aria-busy={loading}>
                {loading ? 'Đang xử lý…' : 'Đổi mật khẩu'}
              </button>
            </form>

            <div className={`${styles.footerLinks} ${styles.centered}`}>
              <button
                type="button"
                className={styles.forgotLink}
                disabled={cooldown > 0 || loading}
                onClick={() => sendCode(email)}
              >
                {cooldown > 0 ? `Gửi lại mã sau ${cooldown}s` : 'Gửi lại mã OTP'}
              </button>
            </div>
          </>
        )}

        <div className={`${styles.footerLinks} ${styles.centered}`}>
          <Link href="/" className={styles.forgotLink}>
            <ArrowLeft size={14} className={styles.backIcon} aria-hidden="true" />
            Quay lại đăng nhập
          </Link>
        </div>
      </main>
      </div>
    </div>
  );
}

function ResetPasswordFallback() {
  return (
    <div className={styles.container}>
      <header className={styles.topbar}>
        <div className={styles.topbarInner}>
          <span className={styles.crest} aria-hidden="true">THPT</span>
          <div>
            <p className={styles.brandTitle}>Kỳ thi tốt nghiệp THPT Quốc gia</p>
            <p className={styles.brandSub}>Khôi phục mật khẩu tài khoản thí sinh</p>
          </div>
        </div>
      </header>
      <div className={styles.cardWrap}>
        <div className={styles.card} role="status" aria-live="polite" aria-busy="true">
          <span className={styles.visuallyHidden}>Đang tải trang khôi phục mật khẩu…</span>
          <div className={`${styles.skeletonLine} ${styles.skeletonTitle}`} aria-hidden="true" />
          <div className={styles.skeletonLine} style={{ width: '85%', marginBottom: 24 }} aria-hidden="true" />
          <div className={styles.skeletonLine} style={{ marginBottom: 18 }} aria-hidden="true" />
          <div className={styles.skeletonLine} style={{ marginBottom: 18 }} aria-hidden="true" />
          <div className={`${styles.skeletonLine} ${styles.skeletonBtn}`} aria-hidden="true" />
        </div>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<ResetPasswordFallback />}>
      <ResetPasswordForm />
    </Suspense>
  );
}
