'use client';

import { Turnstile } from '@marsidev/react-turnstile';

export const turnstileSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? '';

export default function CaptchaChallenge({
  onToken,
}: {
  onToken: (token: string | null) => void;
}) {
  if (!turnstileSiteKey) return null;

  return (
    <Turnstile
      siteKey={turnstileSiteKey}
      onSuccess={(token) => onToken(token)}
      onExpire={() => onToken(null)}
      onError={() => onToken(null)}
      options={{ theme: 'auto', language: 'vi' }}
    />
  );
}
