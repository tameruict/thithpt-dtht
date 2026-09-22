'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { User, Lock, Mail, Eye, EyeOff } from 'lucide-react';
import styles from '@/styles/auth.module.css';
import { createClient } from '@/lib/supabase/client';
import { hasSupabaseEnv } from '@/lib/supabase/env';
import { ensureStudentProfile, loadCandidateProfile } from '@/lib/supabase/user-profile';
import { translateAuthError } from '@/lib/supabase/auth-errors';
import { beginGoogleOAuth } from '@/lib/supabase/google-oauth';
import {
  getPasswordPolicyError,
  MIN_PASSWORD_LENGTH,
} from '@/lib/supabase/password-policy';
import CaptchaChallenge, {
  turnstileSiteKey,
} from '@/components/auth/CaptchaChallenge';
import { useExamStore } from '@/store/useExamStore';

export default function RegisterPage() {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const router = useRouter();
  const login = useExamStore((state) => state.login);

  // Inline validation nhẹ: chỉ báo khi trường có nội dung nhưng chưa hợp lệ,
  // không thay đổi logic submit (submit vẫn kiểm tra đầy đủ như cũ).
  const emailInvalid = email.trim().length > 0 && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const passwordShort = password.length > 0 && password.length < MIN_PASSWORD_LENGTH;

  const handleRegister = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    setMessage('');

    if (!hasSupabaseEnv()) {
      setError('Chưa cấu hình Supabase. Hãy thêm .env.local trước khi đăng ký.');
      return;
    }

    const trimmedName = fullName.trim();
    const trimmedEmail = email.trim();

    if (!trimmedName) {
      setError('Vui lòng nhập họ và tên.');
      return;
    }

    if (!trimmedEmail) {
      setError('Vui lòng nhập địa chỉ email.');
      return;
    }

    const passwordError = getPasswordPolicyError(password);
    if (passwordError) {
      setError(passwordError);
      return;
    }

    setLoading(true);

    try {
      if (turnstileSiteKey && !captchaToken) {
        setError('Vui lòng hoàn tất xác minh chống bot.');
        return;
      }
      const supabase = createClient();
      const { data, error: authError } = await supabase.auth.signUp({
        email: trimmedEmail,
        password,
        options: {
          data: { full_name: trimmedName },
          captchaToken: captchaToken ?? undefined,
          emailRedirectTo: `${window.location.origin}/auth/confirm`,
        },
      });

      if (authError) {
        setError(translateAuthError(authError.message));
        return;
      }

      if (data.user && data.session) {
        await ensureStudentProfile(supabase, data.user, trimmedName);
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
        router.push('/subjects', { transitionTypes: ['nav-forward'] });
        return;
      }

      setMessage('Đăng ký thành công! Hãy kiểm tra email để xác nhận tài khoản.');
      window.setTimeout(() => router.push('/', { transitionTypes: ['nav-back'] }), 1500);
    } catch (registerError) {
      const nextError =
        registerError instanceof Error
          ? translateAuthError(registerError.message)
          : 'Không thể tạo tài khoản. Vui lòng thử lại.';
      setError(nextError);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleRegister = async () => {
    setError('');
    setMessage('');

    if (!hasSupabaseEnv()) {
      setError('Chưa cấu hình Supabase. Hãy thêm .env.local trước khi đăng ký.');
      return;
    }

    setGoogleLoading(true);

    try {
      const callbackUrl = new URL('/auth/confirm', window.location.origin);
      callbackUrl.searchParams.set('next', '/subjects');

      const supabase = createClient();
      await beginGoogleOAuth(
        (request) => supabase.auth.signInWithOAuth(request),
        callbackUrl.toString(),
        (url) => window.location.assign(url),
      );
    } catch (googleError) {
      setError(
        googleError instanceof Error
          ? translateAuthError(googleError.message)
          : 'Không thể đăng ký bằng Google. Vui lòng thử lại.',
      );
      setGoogleLoading(false);
    }
  };

  return (
    <div className={styles.container}>
      <header className={styles.topbar}>
        <div className={styles.topbarInner}>
          <span className={styles.crest} aria-hidden="true">THPT</span>
          <div>
            <p className={styles.brandTitle}>Kỳ thi tốt nghiệp THPT Quốc gia</p>
            <p className={styles.brandSub}>Tạo tài khoản thí sinh — miễn phí, 1 phút</p>
          </div>
        </div>
      </header>

      <div className={styles.main}>
        <section className={styles.heroPanel} aria-labelledby="register-hero-title">
          <span className={styles.heroKicker}>Thí sinh mới</span>
          <h2 id="register-hero-title" className={styles.heroTitle}>
            Một tài khoản cho mọi môn thi
          </h2>
          <p className={styles.heroText}>
            Họ tên dùng để in số báo danh và bảng điểm. Email dùng để đăng nhập và
            khôi phục mật khẩu. Mật khẩu tối thiểu {MIN_PASSWORD_LENGTH} ký tự.
          </p>
          <ol className={styles.steps}>
            <li className={styles.step}>
              <span className={styles.stepNum} aria-hidden="true">1</span>
              <div><strong>Nhập họ tên + email</strong><span>Viết đúng dấu để bảng điểm đẹp.</span></div>
            </li>
            <li className={styles.step}>
              <span className={styles.stepNum} aria-hidden="true">2</span>
              <div><strong>Tạo mật khẩu</strong><span>Tối thiểu {MIN_PASSWORD_LENGTH} ký tự, nên có số.</span></div>
            </li>
            <li className={styles.step}>
              <span className={styles.stepNum} aria-hidden="true">3</span>
              <div><strong>Xác nhận email</strong><span>Kiểm tra hộp thư nếu được yêu cầu.</span></div>
            </li>
          </ol>
        </section>

        <main id="main" tabIndex={-1} className={styles.card} aria-labelledby="register-title">
          <h1 id="register-title" className={styles.title}>Đăng ký</h1>
          <p className={styles.subtitle}>
            Bạn đã có tài khoản? <Link href="/" transitionTypes={['nav-back']} className={styles.linkRed}>Đăng nhập ngay</Link>
          </p>

        <form onSubmit={handleRegister}>
          <div className={styles.formGroup}>
            <label className={styles.label} htmlFor="register-name">Họ và tên <span className={styles.required}>*</span></label>
            <div className={styles.inputWrapper}>
              <User className={styles.inputIcon} aria-hidden="true" />
              <input
                id="register-name"
                name="fullName"
                type="text"
                required
                className={styles.input}
                placeholder="Nguyễn Văn A"
                autoComplete="name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
              />
            </div>
          </div>

          <div className={styles.formGroup}>
            <label className={styles.label} htmlFor="register-email">Email <span className={styles.required}>*</span></label>
            <div className={styles.inputWrapper}>
              <Mail className={styles.inputIcon} aria-hidden="true" />
              <input
                id="register-email"
                name="email"
                type="email"
                required
                className={styles.input}
                placeholder="nhap-email@example.com"
                autoComplete="email"
                value={email}
                aria-invalid={emailInvalid}
                aria-describedby={emailInvalid ? 'register-email-error' : undefined}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            {emailInvalid ? (
              <p id="register-email-error" className={styles.fieldError} role="alert">
                Email chưa đúng định dạng, ví dụ: ten@example.com
              </p>
            ) : null}
          </div>

          <div className={styles.formGroup}>
            <label className={styles.label} htmlFor="register-password">Mật khẩu <span className={styles.required}>*</span></label>
            <div className={styles.inputWrapper}>
              <Lock className={styles.inputIcon} aria-hidden="true" />
              <input
                id="register-password"
                name="newPassword"
                type={showPassword ? 'text' : 'password'}
                required
                minLength={MIN_PASSWORD_LENGTH}
                className={styles.input}
                placeholder="Tạo mật khẩu"
                autoComplete="new-password"
                aria-invalid={passwordShort}
                aria-describedby={passwordShort ? 'register-password-error' : 'register-password-hint'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button 
                type="button" 
                className={styles.inputRightIcon}
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                aria-pressed={showPassword}
              >
                {showPassword ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
              </button>
            </div>
            {passwordShort ? (
              <p id="register-password-error" className={styles.fieldError} role="alert">
                Còn thiếu {MIN_PASSWORD_LENGTH - password.length} ký tự (tối thiểu {MIN_PASSWORD_LENGTH}).
              </p>
            ) : (
              <p id="register-password-hint" className={styles.fieldHint}>Tối thiểu {MIN_PASSWORD_LENGTH} ký tự.</p>
            )}
          </div>

          <CaptchaChallenge onToken={setCaptchaToken} />
          <div aria-live="assertive">
            {error && <p className={styles.errorText} role="alert">{error}</p>}
            {message && <p className={`${styles.errorText} ${styles.successText}`} role="status">{message}</p>}
          </div>

          <button
            type="submit"
            className={styles.submitBtn}
            disabled={loading || googleLoading}
            aria-busy={loading}
          >
            {loading ? 'Đang tạo tài khoản...' : 'Đăng ký'}
          </button>
        </form>

        <div className={styles.authDivider} aria-hidden="true">
          <span>hoặc</span>
        </div>

        <button
          type="button"
          className={styles.googleBtn}
          onClick={handleGoogleRegister}
          disabled={loading || googleLoading}
          aria-busy={googleLoading}
        >
          <svg className={styles.googleIcon} viewBox="0 0 24 24" aria-hidden="true">
            <path fill="#4285F4" d="M21.6 12.23c0-.71-.06-1.4-.19-2.07H12v3.92h5.38a4.6 4.6 0 0 1-2 3.02v2.54h3.24c1.9-1.75 2.98-4.33 2.98-7.41Z" />
            <path fill="#34A853" d="M12 22c2.7 0 4.97-.9 6.62-2.36l-3.24-2.54c-.9.6-2.05.96-3.38.96-2.6 0-4.81-1.76-5.6-4.13H3.05v2.62A10 10 0 0 0 12 22Z" />
            <path fill="#FBBC05" d="M6.4 13.93A6.02 6.02 0 0 1 6.08 12c0-.67.12-1.32.32-1.93V7.45H3.05A10 10 0 0 0 2 12c0 1.61.39 3.14 1.05 4.55l3.35-2.62Z" />
            <path fill="#EA4335" d="M12 5.94c1.47 0 2.79.5 3.83 1.5l2.87-2.87A9.64 9.64 0 0 0 12 2a10 10 0 0 0-8.95 5.45l3.35 2.62c.79-2.37 3-4.13 5.6-4.13Z" />
          </svg>
          <span>{googleLoading ? 'Đang chuyển tới Google...' : 'Tiếp tục với Google'}</span>
        </button>
        </main>
      </div>
    </div>
  );
}
