import { createClient } from 'npm:@supabase/supabase-js@2.112.3';
import {
  buildProviderRequest,
  extractPaymentCode,
  highestContractVersion,
  parseProviderPage,
  parseThueApiBankContract,
  ThueApiBankError,
  type NormalizedPaymentEvent,
  type ThueApiBankContract,
} from '../_shared/thueapibank.ts';

const provider = 'thueapibank';

type RpcResult = {
  data: unknown;
  error: { message?: string } | null;
};

type ServiceClient = {
  rpc(name: string, args: Record<string, unknown>): Promise<RpcResult>;
};

function json(body: Record<string, unknown>, status = 200) {
  return Response.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

function requiredEnv(name: string) {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new ThueApiBankError(`CONFIG_${name}_REQUIRED`);
  return value;
}

function getServiceKey() {
  const direct =
    Deno.env.get('SUPABASE_SECRET_KEY')?.trim() ||
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')?.trim();
  if (direct) return direct;

  const secretKeys = Deno.env.get('SUPABASE_SECRET_KEYS');
  if (secretKeys) {
    try {
      const parsed = JSON.parse(secretKeys) as Record<string, unknown>;
      const defaultKey = parsed.default;
      if (typeof defaultKey === 'string' && defaultKey.trim()) {
        return defaultKey.trim();
      }
    } catch {
      // The shortened code below is returned; secret content is never logged.
    }
  }
  throw new ThueApiBankError('CONFIG_SUPABASE_SECRET_KEY_REQUIRED');
}

function timingSafeEqual(left: string, right: string) {
  const encoder = new TextEncoder();
  const leftBytes = encoder.encode(left);
  const rightBytes = encoder.encode(right);
  let mismatch = leftBytes.length ^ rightBytes.length;
  const maxLength = Math.max(leftBytes.length, rightBytes.length);
  for (let index = 0; index < maxLength; index += 1) {
    mismatch |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0);
  }
  return mismatch === 0;
}

function loadContract() {
  const raw = requiredEnv('THUEAPIBANK_CONTRACT_JSON');
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new ThueApiBankError('CONTRACT_JSON_INVALID');
  }

  const candidates = (Array.isArray(parsed) ? parsed : [parsed]).map(
    parseThueApiBankContract,
  );
  const contract = highestContractVersion(candidates);
  if (!contract) throw new ThueApiBankError('CONTRACT_REQUIRED');
  return contract;
}

function createServiceClient(): ServiceClient {
  return createClient(requiredEnv('SUPABASE_URL'), getServiceKey(), {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  }) as unknown as ServiceClient;
}

async function sha256(value: unknown) {
  const serialized = JSON.stringify(value);
  const bytes = new TextEncoder().encode(serialized);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
}

async function fetchPage(
  contract: ThueApiBankContract,
  apiKey: string,
  cursor: string | null,
) {
  const request = buildProviderRequest(contract, apiKey, cursor);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4500);
  try {
    const response = await fetch(request.url, {
      ...request.init,
      signal: controller.signal,
    });
    if (response.status === 401 || response.status === 403) {
      throw new ThueApiBankError('PROVIDER_AUTH_FAILED');
    }
    if (response.status === 429) {
      throw new ThueApiBankError('PROVIDER_RATE_LIMITED');
    }
    if (response.status >= 500) {
      throw new ThueApiBankError('PROVIDER_UNAVAILABLE');
    }
    if (!response.ok) {
      throw new ThueApiBankError('PROVIDER_REQUEST_REJECTED');
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new ThueApiBankError('PROVIDER_RESPONSE_NOT_JSON');
    }
    return parseProviderPage(payload, contract);
  } catch (error) {
    if (error instanceof ThueApiBankError) throw error;
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new ThueApiBankError('PROVIDER_TIMEOUT');
    }
    throw new ThueApiBankError('PROVIDER_NETWORK_ERROR');
  } finally {
    clearTimeout(timeout);
  }
}

async function processEvent(
  client: ServiceClient,
  event: NormalizedPaymentEvent,
  expectedBankCode: string,
  expectedAccountNumber: string,
) {
  const { error } = await client.rpc('process_bank_payment', {
    p_provider: event.provider,
    p_provider_event_id: event.providerEventId,
    p_transaction_at: event.transactionAt,
    p_direction: event.direction,
    p_amount: event.amount,
    p_content: event.content,
    p_payment_code: extractPaymentCode(event.content),
    p_account_number: event.accountNumber,
    p_expected_account_number: expectedAccountNumber,
    p_bank_code: event.bankCode,
    p_expected_bank_code: expectedBankCode,
    p_provider_reference: event.providerReference,
    p_payload: event.raw,
    p_payload_sha256: await sha256(event.raw),
  });
  if (error) throw new ThueApiBankError('DATABASE_PAYMENT_PROCESSING_FAILED');
}

function errorCode(error: unknown) {
  return error instanceof ThueApiBankError ? error.code : 'POLL_FAILED';
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') {
    return json({ success: false, error: 'METHOD_NOT_ALLOWED' }, 405);
  }
  if (Deno.env.get('KEY_PURCHASE_ENABLED')?.trim().toLowerCase() !== 'true') {
    return json({ success: false, error: 'CHECKOUT_DISABLED' }, 503);
  }

  let pollSecret: string;
  try {
    pollSecret = requiredEnv('THUEAPIBANK_POLL_SECRET');
  } catch (error) {
    return json({ success: false, error: errorCode(error) }, 503);
  }
  const suppliedSecret = request.headers.get('x-poll-secret') ?? '';
  if (!timingSafeEqual(suppliedSecret, pollSecret)) {
    return json({ success: false, error: 'UNAUTHORIZED' }, 401);
  }

  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const force = body.force === true;
  const owner = crypto.randomUUID();
  let client: ServiceClient | null = null;
  let leaseAcquired = false;

  try {
    const contract = loadContract();
    const apiKey = requiredEnv('THUEAPIBANK_API_KEY');
    const expectedBankCode = requiredEnv('PAYMENT_BANK_CODE').toUpperCase();
    const expectedAccountNumber = requiredEnv('PAYMENT_BANK_ACCOUNT').replace(/\s+/g, '');
    client = createServiceClient();

    const leaseResult = await client.rpc('claim_payment_provider_lease', {
      p_provider: provider,
      p_owner: owner,
      p_lease_seconds: 20,
      p_force: force,
    });
    if (leaseResult.error) {
      throw new ThueApiBankError('DATABASE_LEASE_FAILED');
    }
    const lease = leaseResult.data as Record<string, unknown> | null;
    if (!lease?.acquired) {
      return json({
        success: true,
        skipped: true,
        reason: typeof lease?.reason === 'string' ? lease.reason : 'LEASE_NOT_ACQUIRED',
      });
    }
    leaseAcquired = true;

    const cursor = typeof lease.cursor === 'string' ? lease.cursor : null;
    const page = await fetchPage(contract, apiKey, cursor);
    for (const event of page.events) {
      await processEvent(client, event, expectedBankCode, expectedAccountNumber);
    }

    const completion = await client.rpc('complete_payment_provider_poll', {
      p_provider: provider,
      p_owner: owner,
      p_cursor: page.nextCursor,
      p_success: true,
      p_error_code: null,
      p_disable_auto_fulfillment: false,
    });
    if (completion.error) {
      throw new ThueApiBankError('DATABASE_POLL_COMPLETION_FAILED');
    }
    leaseAcquired = false;

    return json({
      success: true,
      provider,
      contractVersion: contract.version,
      processed: page.events.length,
      cursorAdvanced: Boolean(page.nextCursor),
    });
  } catch (error) {
    const code = errorCode(error);
    const disableAuto = [
      'PROVIDER_AUTH_FAILED',
      'STABLE_EVENT_ID_REQUIRED',
      'TRANSACTION_DIRECTION_INVALID',
      'PROVIDER_EVENT_ID_DUPLICATED_IN_PAGE',
      'PROVIDER_ITEMS_MALFORMED',
    ].includes(code);
    if (client && leaseAcquired) {
      await client.rpc('complete_payment_provider_poll', {
        p_provider: provider,
        p_owner: owner,
        p_cursor: null,
        p_success: false,
        p_error_code: code,
        p_disable_auto_fulfillment: disableAuto,
      });
    }
    console.error(JSON.stringify({ provider, error: code }));
    return json(
      { success: false, provider, error: code, autoFulfillmentDisabled: disableAuto },
      code === 'PROVIDER_AUTH_FAILED' ? 503 : 502,
    );
  }
});
