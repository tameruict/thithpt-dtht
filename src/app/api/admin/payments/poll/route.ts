import {
  getPaymentPollFunctionConfig,
  isKeyPurchaseEnabled,
} from '@/lib/payments/config';
import { requireAdmin } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function json(body: Record<string, unknown>, status: number) {
  return Response.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

export async function POST() {
  await requireAdmin();
  if (!isKeyPurchaseEnabled()) {
    return json({ success: false, error: 'CHECKOUT_DISABLED' }, 503);
  }

  let config;
  try {
    config = getPaymentPollFunctionConfig();
  } catch {
    return json({ success: false, error: 'POLLER_NOT_CONFIGURED' }, 503);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(config.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-poll-secret': config.pollSecret,
      },
      body: JSON.stringify({ force: true, source: 'admin' }),
      cache: 'no-store',
      signal: controller.signal,
    });
    const result = await response.json().catch(() => ({
      success: false,
      error: 'POLLER_RESPONSE_INVALID',
    }));
    return json(result as Record<string, unknown>, response.status);
  } catch {
    return json({ success: false, error: 'POLLER_UNREACHABLE' }, 502);
  } finally {
    clearTimeout(timeout);
  }
}
