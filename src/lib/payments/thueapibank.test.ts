import { describe, expect, it } from 'vitest';
import {
  buildProviderRequest,
  extractPaymentCode,
  highestContractVersion,
  parseProviderPage,
  parseThueApiBankContract,
  ThueApiBankError,
} from '../../../supabase/functions/_shared/thueapibank';

const rawContract = {
  version: 'v3',
  baseUrl: 'https://bank.example.test/',
  endpoint: '/api/v3/transactions',
  method: 'GET',
  auth: { location: 'header', name: 'X-API-Key', prefix: '' },
  pagination: {
    requestCursorName: 'cursor',
    responseCursorPath: 'data.next_cursor',
  },
  response: { itemsPath: 'data.transactions' },
  fields: {
    providerEventId: 'transaction.id',
    transactionAt: 'transaction.created_at',
    direction: 'transaction.type',
    amount: 'transaction.amount',
    content: 'transaction.description',
    accountNumber: 'account.number',
    bankCode: 'account.bank',
    providerReference: 'transaction.reference',
  },
  directionValues: { in: ['credit'], out: ['debit'] },
};

const mbbContract = {
  version: 'v2',
  baseUrl: 'https://thueapibank.vn/',
  endpoint: '/historyapimbv2/{API_KEY}',
  method: 'GET',
  accountScoped: true,
  auth: { location: 'path', name: '{API_KEY}', prefix: '' },
  pagination: {
    requestCursorName: null,
    responseCursorPath: null,
  },
  response: {
    itemsPath: 'transactions',
    statusPath: 'status',
    successValues: ['success'],
  },
  fields: {
    providerEventId: 'transactionID',
    transactionAt: 'transactionDate',
    direction: 'type',
    amount: 'amount',
    content: 'description',
    accountNumber: null,
    bankCode: null,
    providerReference: null,
  },
  directionValues: { in: ['IN'], out: ['OUT'] },
};

function mbbTransaction(overrides: Record<string, unknown> = {}) {
  return {
    type: 'IN',
    transactionID: '1768-example',
    amount: '50000',
    description: 'THPTABC123456789',
    transactionDate: '14/01/2026',
    ...overrides,
  };
}

function transaction(overrides: Record<string, unknown> = {}) {
  return {
    transaction: {
      id: 'tx-100',
      created_at: '25/08/2026 14:10:05',
      type: 'credit',
      amount: '125.000',
      description: 'THPTABC123456789',
      reference: 'FT260825100',
      ...(overrides.transaction as object | undefined),
    },
    account: {
      number: ' 1017 588 888 ',
      bank: 'vcb',
      ...(overrides.account as object | undefined),
    },
  };
}

describe('ThueAPIBank contract adapter', () => {
  it('normalizes a successful page and Asia/Ho_Chi_Minh timestamp', () => {
    const contract = parseThueApiBankContract(rawContract);
    expect(
      parseProviderPage(
        {
          data: {
            transactions: [transaction()],
            next_cursor: 'cursor-2',
          },
        },
        contract,
      ),
    ).toEqual({
      nextCursor: 'cursor-2',
      events: [
        {
          provider: 'thueapibank',
          providerEventId: 'tx-100',
          transactionAt: '2026-08-25T07:10:05.000Z',
          direction: 'in',
          amount: 125000,
          content: 'THPTABC123456789',
          accountNumber: '1017588888',
          bankCode: 'VCB',
          providerReference: 'FT260825100',
          raw: transaction(),
        },
      ],
    });
  });

  it('accepts an empty list and a provider without cursor support', () => {
    const contract = parseThueApiBankContract({
      ...rawContract,
      pagination: { requestCursorName: null, responseCursorPath: null },
    });
    expect(parseProviderPage({ data: { transactions: [] } }, contract)).toEqual({
      events: [],
      nextCursor: null,
    });
  });

  it('builds header and query authentication without exposing it in both places', () => {
    const headerContract = parseThueApiBankContract(rawContract);
    const headerRequest = buildProviderRequest(headerContract, 'secret', 'cursor-1');
    expect(headerRequest.url).toBe(
      'https://bank.example.test/api/v3/transactions?cursor=cursor-1',
    );
    expect(headerRequest.init.headers.get('X-API-Key')).toBe('secret');

    const queryContract = parseThueApiBankContract({
      ...rawContract,
      auth: { location: 'query', name: 'api_key', prefix: '' },
    });
    const queryRequest = buildProviderRequest(queryContract, 'secret', null);
    expect(queryRequest.url).toContain('api_key=secret');
    expect(queryRequest.init.headers.has('api_key')).toBe(false);
  });

  it('URL-encodes path authentication in the declared placeholder only', () => {
    const contract = parseThueApiBankContract(mbbContract);
    const request = buildProviderRequest(contract, 'secret/with ?#', null);

    expect(request.url).toBe(
      'https://thueapibank.vn/historyapimbv2/secret%2Fwith%20%3F%23',
    );
    expect(new URL(request.url).search).toBe('');
    expect(Array.from(request.init.headers.keys())).toEqual(['accept']);
  });

  it('normalizes the MBB GET fixture without treating merchant as an account', () => {
    const contract = parseThueApiBankContract(mbbContract);
    const raw = mbbTransaction();

    expect(
      parseProviderPage(
        {
          status: 'success',
          msg: 'Success',
          merchant: 'MERCHANT_CODE',
          transactions: [raw],
        },
        contract,
      ),
    ).toEqual({
      nextCursor: null,
      events: [
        {
          provider: 'thueapibank',
          providerEventId: '1768-example',
          transactionAt: '2026-01-14T16:59:59.999Z',
          direction: 'in',
          amount: 50000,
          content: 'THPTABC123456789',
          accountNumber: null,
          bankCode: null,
          providerReference: null,
          raw,
        },
      ],
    });
  });

  it('validates MBB top-level status before reading transactions', () => {
    const contract = parseThueApiBankContract(mbbContract);
    expect(() =>
      parseProviderPage({ status: 'error', transactions: [] }, contract),
    ).toThrowError(expect.objectContaining({ code: 'PROVIDER_STATUS_NOT_SUCCESS' }));
    expect(() => parseProviderPage({ transactions: [] }, contract)).toThrowError(
      expect.objectContaining({ code: 'PROVIDER_STATUS_NOT_SUCCESS' }),
    );
  });

  it('strictly validates MBB DD/MM/YYYY transaction dates', () => {
    const contract = parseThueApiBankContract(mbbContract);
    for (const transactionDate of ['31/02/2026', '14-01-2026']) {
      expect(() =>
        parseProviderPage(
          {
            status: 'success',
            transactions: [mbbTransaction({ transactionDate })],
          },
          contract,
        ),
      ).toThrowError(expect.objectContaining({ code: 'TRANSACTION_TIME_INVALID' }));
    }
  });

  it('allows optional account fields only for account-scoped contracts', () => {
    expect(parseThueApiBankContract(mbbContract).accountScoped).toBe(true);
    expect(() =>
      parseThueApiBankContract({ ...mbbContract, accountScoped: false }),
    ).toThrowError(expect.objectContaining({ code: 'CONTRACT_ACCOUNT_FIELD_REQUIRED' }));
  });

  it('requires a path-auth placeholder and preserves MBB event dedupe', () => {
    expect(() =>
      parseThueApiBankContract({ ...mbbContract, endpoint: '/historyapimbv2' }),
    ).toThrowError(
      expect.objectContaining({ code: 'CONTRACT_AUTH_PATH_PLACEHOLDER_REQUIRED' }),
    );

    const contract = parseThueApiBankContract(mbbContract);
    expect(() =>
      parseProviderPage(
        {
          status: 'success',
          transactions: [mbbTransaction(), mbbTransaction()],
        },
        contract,
      ),
    ).toThrowError(
      expect.objectContaining({ code: 'PROVIDER_EVENT_ID_DUPLICATED_IN_PAGE' }),
    );
  });

  it('rejects malformed pages, unstable IDs, invalid directions, and duplicate IDs', () => {
    const contract = parseThueApiBankContract(rawContract);
    expect(() => parseProviderPage({ data: {} }, contract)).toThrowError(
      expect.objectContaining({ code: 'PROVIDER_ITEMS_MALFORMED' }),
    );
    expect(() =>
      parseProviderPage(
        {
          data: {
            transactions: [transaction({ transaction: { id: '' } })],
          },
        },
        contract,
      ),
    ).toThrowError(expect.objectContaining({ code: 'STABLE_EVENT_ID_REQUIRED' }));
    expect(() =>
      parseProviderPage(
        {
          data: {
            transactions: [transaction({ transaction: { type: 'unknown' } })],
          },
        },
        contract,
      ),
    ).toThrowError(
      expect.objectContaining({ code: 'TRANSACTION_DIRECTION_INVALID' }),
    );
    expect(() =>
      parseProviderPage(
        { data: { transactions: [transaction(), transaction()] } },
        contract,
      ),
    ).toThrowError(
      expect.objectContaining({ code: 'PROVIDER_EVENT_ID_DUPLICATED_IN_PAGE' }),
    );
  });

  it('requires exactly one payment code in content', () => {
    expect(extractPaymentCode('Thanh toan THPTABC123456789')).toBe(
      'THPTABC123456789',
    );
    expect(extractPaymentCode('khong co ma')).toBe('');
    expect(
      extractPaymentCode('THPTABC123456789 va THPTZZZ123456789'),
    ).toBe('');
    expect(extractPaymentCode('XTHPTABC123456789Y')).toBe('');
  });

  it('chooses the highest validated V1/V2/V3 contract', () => {
    const contracts = ['v1', 'v3', 'v2'].map((version) =>
      parseThueApiBankContract({ ...rawContract, version }),
    );
    expect(highestContractVersion(contracts)?.version).toBe('v3');
  });

  it('requires HTTPS and a complete field mapping', () => {
    expect(() =>
      parseThueApiBankContract({ ...rawContract, baseUrl: 'http://bank.test/' }),
    ).toThrowError(expect.objectContaining({ code: 'CONTRACT_BASE_URL_HTTPS_REQUIRED' }));
    expect(() =>
      parseThueApiBankContract({ ...rawContract, fields: {} }),
    ).toThrow(ThueApiBankError);
  });
});
