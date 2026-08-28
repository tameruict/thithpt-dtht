'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { User, Lock, Eye, EyeOff } from 'lucide-react';
import styles from '@/styles/auth.module.css';
import { useExamStore } from '@/store/useExamStore';
import { createClient } from '@/lib/supabase/client';
import { hasSupabaseEnv } from '@/lib/supabase/env';
import { loadCandidateProfile } from '@/lib/supabase/user-profile';
import { translateAuthError } from '@/lib/supabase/auth-errors';
import CaptchaChallenge, {
  turnstileSiteKey,
} from '@/components/auth/CaptchaChallenge';

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
      setError('Chua cau hinh Supabase. Hay them .env.local truoc khi dang nhap.');
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
      const { error: authError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: callbackUrl.toString(),
        },
      });

      if (authError) {
        console.error('Google OAuth error:', authError);
        setError(translateAuthError(authError.message));
        setGoogleLoading(false);
      }
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
      <div className={styles.logoArea}>
        <div className={styles.logoText}>BỘ GIÁO DỤC VÀ ĐÀO TẠO</div>
        <div className={styles.logoSub}>KỲ THI TỐT NGHIỆP THPT QUỐC GIA</div>
      </div>
      
      <div className={styles.orbStage} aria-hidden="true">
        <span className={styles.orbitRing} />
        <span className={styles.orbitRingAlt} />
        <div className={styles.energyOrb}>
          <span className={styles.orbGrid} />
          <span className={styles.orbLightning} />
          <span className={styles.orbCore} />
        </div>
      </div>

      <div className={styles.card}>
        <h1 className={styles.title}>Đăng nhập</h1>
        <p className={styles.subtitle}>
          Bạn chưa có tài khoản? <Link href="/register" transitionTypes={['nav-forward']} className={styles.linkRed}>Đăng ký ngay</Link>
        </p>

        <form onSubmit={handleLogin}>
          <div className={styles.formGroup}>
            <label className={styles.label} htmlFor="login-email">Email <span className={styles.required}>*</span></label>
            <div className={styles.inputWrapper}>
              <User className={styles.inputIcon} />
              <input 
                id="login-email"
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

          <div className={styles.formGroup}>
            <label className={styles.label} htmlFor="login-password">Mật khẩu <span className={styles.required}>*</span></label>
            <div className={styles.inputWrapper}>
              <Lock className={styles.inputIcon} />
              <input 
                id="login-password"
                type={showPassword ? "text" : "password"} 
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
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <CaptchaChallenge onToken={setCaptchaToken} />
          {error && <p className={styles.errorText} role="alert" aria-live="assertive">{error}</p>}

          <button
            type="submit"
            className={styles.submitBtn}
            disabled={loading || googleLoading}
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

        {error && <p className={styles.errorText}>{error}</p>}

        <div className={styles.footerLinks}>
          <Link
            href={email ? `/reset-password?email=${encodeURIComponent(email)}` : '/reset-password'}
            className={styles.forgotLink}
          >
            Quên mật khẩu?
          </Link>
        </div>
      </div>
    </div>
  );
}
