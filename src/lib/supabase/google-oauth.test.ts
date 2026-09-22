import { describe, expect, it, vi } from 'vitest';
import { beginGoogleOAuth } from './google-oauth';

describe('beginGoogleOAuth', () => {
  it('requests an explicit redirect URL and navigates to it', async () => {
    const signInWithOAuth = vi.fn().mockResolvedValue({
      data: { url: 'https://project.supabase.co/auth/v1/authorize?provider=google' },
      error: null,
    });
    const navigate = vi.fn();

    await beginGoogleOAuth(
      signInWithOAuth,
      'https://example.com/auth/confirm?next=%2Fsubjects',
      navigate,
    );

    expect(signInWithOAuth).toHaveBeenCalledWith({
      provider: 'google',
      options: {
        redirectTo: 'https://example.com/auth/confirm?next=%2Fsubjects',
        skipBrowserRedirect: true,
      },
    });
    expect(navigate).toHaveBeenCalledWith(
      'https://project.supabase.co/auth/v1/authorize?provider=google',
    );
  });

  it('surfaces an OAuth error without navigating', async () => {
    const oauthError = { message: 'Unsupported provider' };
    const navigate = vi.fn();

    await expect(
      beginGoogleOAuth(
        vi.fn().mockResolvedValue({ data: { url: null }, error: oauthError }),
        'https://example.com/auth/confirm',
        navigate,
      ),
    ).rejects.toThrow(oauthError.message);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('fails visibly when Supabase returns no redirect URL', async () => {
    const navigate = vi.fn();

    await expect(
      beginGoogleOAuth(
        vi.fn().mockResolvedValue({ data: { url: null }, error: null }),
        'https://example.com/auth/confirm',
        navigate,
      ),
    ).rejects.toThrow('Không thể mở trang đăng nhập Google');
    expect(navigate).not.toHaveBeenCalled();
  });

  it('rejects unsafe redirect protocols', async () => {
    const navigate = vi.fn();

    await expect(
      beginGoogleOAuth(
        vi.fn().mockResolvedValue({ data: { url: 'javascript:alert(1)' }, error: null }),
        'https://example.com/auth/confirm',
        navigate,
      ),
    ).rejects.toThrow('không an toàn');
    expect(navigate).not.toHaveBeenCalled();
  });
});
