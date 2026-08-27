import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  isKeyPurchaseEnabled: vi.fn(),
  getPaymentConfig: vi.fn(),
  getPaymentPollFunctionConfig: vi.fn(),
  createClient: vi.fn(),
}));

vi.mock('@/lib/payments/config', () => ({
  isKeyPurchaseEnabled: mocks.isKeyPurchaseEnabled,
  getPaymentConfig: mocks.getPaymentConfig,
  getPaymentPollFunctionConfig: mocks.getPaymentPollFunctionConfig,
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: mocks.createClient,
}));

import { createPurchaseOrder } from '../../app/purchase/actions';

const productId = '11111111-1111-4111-8111-111111111111';
const idempotencyKey = 'checkout-test-123';

function createSupabaseMock(currency: string) {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    is: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue({
      data: { currency },
      error: null,
    }),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.is.mockReturnValue(query);

  const rpc = vi.fn().mockResolvedValue({
    data: {
      order_id: '22222222-2222-4222-8222-222222222222',
      payment_code: 'THPTABC123456789',
      amount: 125000,
      currency: 'VND',
      status: 'pending',
      expires_at: '2026-08-28T00:00:00.000Z',
      product_snapshot: { id: productId },
    },
    error: null,
  });

  return {
    client: {
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: 'student-1' } },
          error: null,
        }),
      },
      from: vi.fn().mockReturnValue(query),
      rpc,
    },
    rpc,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.isKeyPurchaseEnabled.mockReturnValue(true);
  mocks.getPaymentConfig.mockReturnValue({
    provider: 'thueapibank',
    bankCode: 'MBBANK',
    bankAccount: '0123456789',
  });
  mocks.getPaymentPollFunctionConfig.mockReturnValue({
    url: 'https://project.example.test/functions/v1/poll-thueapibank',
    pollSecret: 'test-placeholder-secret',
  });
});

describe('createPurchaseOrder checkout guards', () => {
  it('does not create an order when checkout configuration is incomplete', async () => {
    const { client, rpc } = createSupabaseMock('VND');
    mocks.createClient.mockResolvedValue(client);
    mocks.getPaymentPollFunctionConfig.mockImplementation(() => {
      throw new Error('missing');
    });

    await expect(createPurchaseOrder(productId, idempotencyKey)).resolves.toEqual({
      ok: false,
      error: 'CHECKOUT_CONFIGURATION_INVALID',
    });
    expect(client.from).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it('does not create an order for a non-VND product', async () => {
    const { client, rpc } = createSupabaseMock('USD');
    mocks.createClient.mockResolvedValue(client);

    await expect(createPurchaseOrder(productId, idempotencyKey)).resolves.toEqual({
      ok: false,
      error: 'PAYMENT_CURRENCY_UNSUPPORTED',
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('creates an order only after configuration and VND checks pass', async () => {
    const { client, rpc } = createSupabaseMock('VND');
    mocks.createClient.mockResolvedValue(client);

    const result = await createPurchaseOrder(productId, idempotencyKey);

    expect(result).toMatchObject({
      ok: true,
      order: {
        amount: 125000,
        currency: 'VND',
        paymentCode: 'THPTABC123456789',
      },
    });
    expect(mocks.getPaymentConfig).toHaveBeenCalledOnce();
    expect(mocks.getPaymentPollFunctionConfig).toHaveBeenCalledOnce();
    expect(rpc).toHaveBeenCalledWith('create_purchase_order', {
      p_product_id: productId,
      p_idempotency_key: idempotencyKey,
    });
  });
});
