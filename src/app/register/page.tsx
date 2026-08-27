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
  const router = useRouter();
  const login = useExamStore((state) => state.login);

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
        <h1 className={styles.title}>Đăng ký</h1>
        <p className={styles.subtitle}>
          Bạn đã có tài khoản? <Link href="/" transitionTypes={['nav-back']} className={styles.linkRed}>Đăng nhập ngay</Link>
        </p>

        <form onSubmit={handleRegister}>
          <div className={styles.formGroup}>
            <label className={styles.label} htmlFor="register-name">Họ và tên <span className={styles.required}>*</span></label>
            <div className={styles.inputWrapper}>
              <User className={styles.inputIcon} />
              <input
                id="register-name"
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
              <Mail className={styles.inputIcon} />
              <input
                id="register-email"
                type="email"
                required
                className={styles.input}
                placeholder="nhap-email@example.com"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
          </div>

          <div className={styles.formGroup}>
            <label className={styles.label} htmlFor="register-password">Mật khẩu <span className={styles.required}>*</span></label>
            <div className={styles.inputWrapper}>
              <Lock className={styles.inputIcon} />
              <input
                id="register-password"
                type={showPassword ? 'text' : 'password'}
                required
                minLength={MIN_PASSWORD_LENGTH}
                className={styles.input}
                placeholder="Tạo mật khẩu"
                autoComplete="new-password"
                value={password}
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
          {message && <p className={`${styles.errorText} ${styles.successText}`}>{message}</p>}

          <button type="submit" className={styles.submitBtn} disabled={loading}>
            Đăng ký
          </button>
        </form>
      </div>
    </div>
  );
}
