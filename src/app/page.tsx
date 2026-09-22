'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { User, Lock, Eye, EyeOff, ShieldCheck, ClipboardList, KeyRound } from 'lucide-react';
import styles from '@/styles/auth.module.css';
import { useExamStore } from '@/store/useExamStore';
import { createClient } from '@/lib/supabase/client';
import { hasSupabaseEnv } from '@/lib/supabase/env';
import { loadCandidateProfile } from '@/lib/supabase/user-profile';
import { translateAuthError } from '@/lib/supabase/auth-errors';
import { beginGoogleOAuth } from '@/lib/supabase/google-oauth';

// Turnstile kéo script Cloudflare + lib React khá nặng: tải lười ở client để
// không chặn First Paint của trang đăng nhập.
const CaptchaChallenge = dynamic(
  () => import('@/components/auth/CaptchaChallenge').then((module) => module.default),
  { ssr: false },
);
const turnstileSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? '';

function getPostLoginPath() {
  const redirect = new URLSearchParams(window.location.search).get('redirect');

  return redirect?.startsWith('/') && !redirect.startsWith('//')
    ? redirect
    : '/subjects';
}

function getOAuthErrorFromUrl() {
  const query = new URLSearchParams(window.location.search);
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const code = query.get('auth_error') ?? query.get('error_code') ?? query.get('error') ?? hash.get('error_code') ?? hash.get('error');
  const description = query.get('auth_error_description') ?? query.get('error_description') ?? hash.get('error_description');
  return code ? `${code}${description ? `: ${description}` : ''}` : '';
}

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const router = useRouter();
  const login = useExamStore((state) => state.login);

  useEffect(() => {
    const oauthError = getOAuthErrorFromUrl();
    const oauthErrorTimer = oauthError
      ? window.setTimeout(() => setError(translateAuthError(oauthError)), 0)
      : undefined;
    if (oauthError) {
      const cleanUrl = new URL(window.location.href);
      ['auth_error', 'auth_error_description', 'error', 'error_code', 'error_description', 'error_uri'].forEach((key) => {
        cleanUrl.searchParams.delete(key);
      });
      cleanUrl.hash = '';
      window.history.replaceState({}, '', cleanUrl.toString());
    }

    if (!hasSupabaseEnv()) {
      return () => {
        if (oauthErrorTimer !== undefined) window.clearTimeout(oauthErrorTimer);
      };
    }

    let isMounted = true;
    const supabase = createClient();

    supabase.auth.getUser().then(async ({ data }) => {
      if (!isMounted || !data.user) return;

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
      router.push(getPostLoginPath(), { transitionTypes: ['nav-forward'] });
    });

    return () => {
      isMounted = false;
      if (oauthErrorTimer !== undefined) window.clearTimeout(oauthErrorTimer);
    };
  }, [login, router]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!hasSupabaseEnv()) {
      setError('Chưa cấu hình Supabase. Hãy thêm .env.local trước khi đăng nhập.');
      return;
    }

    setLoading(true);

    try {
      if (turnstileSiteKey && !captchaToken) {
        setError('Vui lòng hoàn tất xác minh chống bot.');
        return;
      }
      const supabase = createClient();
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
        options: { captchaToken: captchaToken ?? undefined },
      });

      if (authError) {
        setError(translateAuthError(authError.message));
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

      router.push(getPostLoginPath(), { transitionTypes: ['nav-forward'] });
    } catch (loginError) {
      console.error('Password login exception:', loginError);
      setError(
        loginError instanceof Error
          ? translateAuthError(loginError.message)
          : 'Không thể đăng nhập lúc này. Vui lòng kiểm tra kết nối và thử lại.',
      );
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setError('');

    if (!hasSupabaseEnv()) {
      setError('Chưa cấu hình Supabase. Hãy thêm .env.local trước khi đăng nhập.');
      return;
    }

    setGoogleLoading(true);

    try {
      const callbackUrl = new URL('/auth/confirm', window.location.origin);
      callbackUrl.searchParams.set('next', getPostLoginPath());

      const supabase = createClient();
      await beginGoogleOAuth(
        (request) => supabase.auth.signInWithOAuth(request),
        callbackUrl.toString(),
        (url) => window.location.assign(url),
      );
    } catch (loginError) {
      console.error('Google login exception:', loginError);
      setError(
        loginError instanceof Error
          ? translateAuthError(loginError.message)
          : 'Không thể đăng nhập bằng Google. Vui lòng thử lại.',
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
            <p className={styles.brandSub}>Cổng thi trực tuyến — đăng nhập để dự thi</p>
          </div>
        </div>
      </header>

      <div className={styles.main}>
        <section className={styles.heroPanel} aria-labelledby="login-hero-title">
          <span className={styles.heroKicker}>Kỳ thi 2026</span>
          <h2 id="login-hero-title" className={styles.heroTitle}>
            Phòng thi trực tuyến, đúng giờ, đúng đề
          </h2>
          <p className={styles.heroText}>
            Đăng nhập bằng tài khoản thí sinh để chọn môn, nhập mã phòng thi và làm bài.
            Giờ làm bài tính theo máy chủ, bài làm tự lưu trong lúc thi.
          </p>
          <ol className={styles.steps}>
            <li className={styles.step}>
              <span className={styles.stepNum} aria-hidden="true">1</span>
              <div><strong>Đăng nhập</strong><span className={styles.stepDesc}>Dùng email và mật khẩu đã đăng ký.</span></div>
            </li>
            <li className={styles.step}>
              <span className={styles.stepNum} aria-hidden="true">2</span>
              <div><strong>Chọn môn &amp; phòng thi</strong><span className={styles.stepDesc}>Xem phòng đang mở, kiểm tra thời gian.</span></div>
            </li>
            <li className={styles.step}>
              <span className={styles.stepNum} aria-hidden="true">3</span>
              <div><strong>Nhập mã &amp; làm bài</strong><span className={styles.stepDesc}>Mã key do hội đồng thi cấp.</span></div>
            </li>
          </ol>
          <p className={styles.supportBox}>
            Gặp sự cố đăng nhập? Kiểm tra email viết đúng, mật khẩu đủ độ dài, hoặc dùng “Quên mật khẩu”.
          </p>
        </section>

        <main id="main" tabIndex={-1} className={styles.card} aria-labelledby="login-title">
          <h1 id="login-title" className={styles.title}>Đăng nhập</h1>
          <p className={styles.subtitle}>
            Bạn chưa có tài khoản? <Link href="/register" transitionTypes={['nav-forward']} className={styles.linkRed}>Đăng ký ngay</Link>
          </p>

          <form onSubmit={handleLogin} noValidate={false}>
            <div className={styles.formGroup}>
              <label className={styles.label} htmlFor="login-email">Email <span className={styles.required} aria-hidden="true">*</span></label>
              <div className={styles.inputWrapper}>
                <User className={styles.inputIcon} aria-hidden="true" />
                <input
                  id="login-email"
                  name="email"
                  type="email"
                  required
                  className={styles.input}
                  value={email}
                  placeholder="nhap-email@example.com"
                  autoComplete="email"
                  inputMode="email"
                  aria-describedby="login-email-hint"
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <p id="login-email-hint" className={styles.fieldHint}>Dùng email đã đăng ký tài khoản thí sinh.</p>
            </div>

            <div className={styles.formGroup}>
              <label className={styles.label} htmlFor="login-password">Mật khẩu <span className={styles.required} aria-hidden="true">*</span></label>
              <div className={styles.inputWrapper}>
                <Lock className={styles.inputIcon} aria-hidden="true" />
                <input
                  id="login-password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  className={styles.input}
                  value={password}
                  placeholder="Nhập mật khẩu"
                  autoComplete="current-password"
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
            </div>

            <CaptchaChallenge onToken={setCaptchaToken} />
            <div aria-live="assertive">
              {error && <p className={styles.errorText} role="alert">{error}</p>}
            </div>

            <button
              type="submit"
              className={styles.submitBtn}
              disabled={loading || googleLoading}
              aria-busy={loading}
            >
              {loading ? 'Đang đăng nhập...' : 'Đăng nhập'}
            </button>
          </form>

          <div className={styles.authDivider} aria-hidden="true">
            <span>hoặc</span>
          </div>

          <button
            type="button"
            className={styles.googleBtn}
            onClick={handleGoogleLogin}
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

          <div className={styles.footerLinks}>
            <Link
              href={email ? `/reset-password?email=${encodeURIComponent(email)}` : '/reset-password'}
              className={styles.forgotLink}
            >
              Quên mật khẩu?
            </Link>
            <ul className={styles.metaList}>
              <li className={styles.metaItem}>
                <ShieldCheck size={14} aria-hidden="true" /> Bảo mật theo phiên Supabase
              </li>
              <li className={styles.metaItem}>
                <ClipboardList size={14} aria-hidden="true" /> Đề thi chuẩn
              </li>
              <li className={styles.metaItem}>
                <KeyRound size={14} aria-hidden="true" /> Vào phòng bằng key
              </li>
            </ul>
          </div>
        </main>
      </div>
    </div>
  );
}
