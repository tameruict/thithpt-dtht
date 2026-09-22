type GoogleOAuthRequest = {
  provider: 'google';
  options: {
    redirectTo: string;
    skipBrowserRedirect: true;
  };
};

type GoogleOAuthResult = {
  data: { url?: string | null } | null;
  error: { message: string } | null;
};

/**
 * Starts Google OAuth without relying on the SDK's implicit browser side
 * effect. Explicit navigation lets us detect and report a missing redirect URL
 * instead of leaving the button in a permanent loading state.
 */
export async function beginGoogleOAuth(
  signInWithOAuth: (request: GoogleOAuthRequest) => Promise<GoogleOAuthResult>,
  redirectTo: string,
  navigate: (url: string) => void,
) {
  const { data, error } = await signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo,
      skipBrowserRedirect: true,
    },
  });

  if (error) {
    throw new Error(error.message);
  }

  if (!data?.url) {
    throw new Error('Không thể mở trang đăng nhập Google. Vui lòng thử lại.');
  }

  let authorizationUrl: URL;
  try {
    authorizationUrl = new URL(data.url);
  } catch {
    throw new Error('Supabase trả về địa chỉ đăng nhập Google không hợp lệ. Vui lòng thử lại.');
  }

  if (!['http:', 'https:'].includes(authorizationUrl.protocol)) {
    throw new Error('Supabase trả về địa chỉ đăng nhập Google không an toàn. Vui lòng thử lại.');
  }

  navigate(authorizationUrl.toString());
}
