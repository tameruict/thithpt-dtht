export type NormalizedPaymentEvent = {
  provider: 'thueapibank';
  providerEventId: string;
  transactionAt: string;
  direction: 'in' | 'out';
  amount: number;
  content: string;
  accountNumber: string | null;
  bankCode: string | null;
  providerReference: string | null;
  raw: unknown;
};

export type ThueApiBankContract = {
  version: 'v1' | 'v2' | 'v3';
  baseUrl: string;
  endpoint: string;
  method: 'GET' | 'POST';
  accountScoped: boolean;
  auth: {
    location: 'header' | 'query' | 'path';
    name: string;
    prefix: string;
  };
  pagination: {
    requestCursorName: string | null;
    responseCursorPath: string | null;
  };
  response: {
    itemsPath: string;
    statusPath: string | null;
    successValues: string[];
  };
  fields: {
    providerEventId: string;
    transactionAt: string;
    direction: string;
    amount: string;
    content: string;
    accountNumber: string | null;
    bankCode: string | null;
    providerReference: string | null;
  };
  directionValues: {
    in: string[];
    out: string[];
  };
};

export type ProviderPage = {
  events: NormalizedPaymentEvent[];
  nextCursor: string | null;
};

export class ThueApiBankError extends Error {
  constructor(
    public readonly code: string,
    message: string = code,
  ) {
    super(message);
    this.name = 'ThueApiBankError';
  }
}

const paymentCodePattern = /(?<![A-Z0-9])(THPT[A-Z0-9]{8,24})(?![A-Z0-9])/gi;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function requiredString(
  record: Record<string, unknown>,
  field: string,
  code: string,
) {
  const value = record[field];
  if (typeof value !== 'string' || !value.trim()) {
    throw new ThueApiBankError(code);
  }
  return value.trim();
}

function optionalString(record: Record<string, unknown>, field: string) {
  const value = record[field];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function readPath(value: unknown, path: string | null): unknown {
  if (!path) return null;
  return path.split('.').reduce<unknown>((current, segment) => {
    if (!isRecord(current)) return undefined;
    return current[segment];
  }, value);
}

function parseStringArray(value: unknown, fallback: string[]) {
  if (!Array.isArray(value)) return fallback;
  const normalized = value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
  return normalized.length > 0 ? normalized : fallback;
}

export function parseThueApiBankContract(input: unknown): ThueApiBankContract {
  if (!isRecord(input)) {
    throw new ThueApiBankError('CONTRACT_INVALID');
  }

  const version = requiredString(input, 'version', 'CONTRACT_VERSION_REQUIRED');
  if (!['v1', 'v2', 'v3'].includes(version)) {
    throw new ThueApiBankError('CONTRACT_VERSION_UNSUPPORTED');
  }

  const method = optionalString(input, 'method')?.toUpperCase() ?? 'GET';
  if (method !== 'GET' && method !== 'POST') {
    throw new ThueApiBankError('CONTRACT_METHOD_UNSUPPORTED');
  }

  const auth = input.auth;
  const pagination = input.pagination;
  const response = input.response;
  const fields = input.fields;
  const directionValues = input.directionValues;
  if (
    !isRecord(auth) ||
    !isRecord(pagination) ||
    !isRecord(response) ||
    !isRecord(fields)
  ) {
    throw new ThueApiBankError('CONTRACT_MAPPING_REQUIRED');
  }

  const authLocation = requiredString(auth, 'location', 'CONTRACT_AUTH_LOCATION_REQUIRED');
  if (!['header', 'query', 'path'].includes(authLocation)) {
    throw new ThueApiBankError('CONTRACT_AUTH_LOCATION_INVALID');
  }

  if (input.accountScoped !== undefined && typeof input.accountScoped !== 'boolean') {
    throw new ThueApiBankError('CONTRACT_ACCOUNT_SCOPE_INVALID');
  }
  const accountScoped = input.accountScoped === true;

  const baseUrl = requiredString(input, 'baseUrl', 'CONTRACT_BASE_URL_REQUIRED');
  let parsedBaseUrl: URL;
  try {
    parsedBaseUrl = new URL(baseUrl);
  } catch {
    throw new ThueApiBankError('CONTRACT_BASE_URL_INVALID');
  }
  if (parsedBaseUrl.protocol !== 'https:') {
    throw new ThueApiBankError('CONTRACT_BASE_URL_HTTPS_REQUIRED');
  }

  const endpoint = requiredString(input, 'endpoint', 'CONTRACT_ENDPOINT_REQUIRED');
  const authName = requiredString(auth, 'name', 'CONTRACT_AUTH_NAME_REQUIRED');
  if (authLocation === 'path' && !endpoint.includes(authName)) {
    throw new ThueApiBankError('CONTRACT_AUTH_PATH_PLACEHOLDER_REQUIRED');
  }

  const accountNumberField = optionalString(fields, 'accountNumber');
  const bankCodeField = optionalString(fields, 'bankCode');
  if (!accountScoped && !accountNumberField) {
    throw new ThueApiBankError('CONTRACT_ACCOUNT_FIELD_REQUIRED');
  }
  if (!accountScoped && !bankCodeField) {
    throw new ThueApiBankError('CONTRACT_BANK_FIELD_REQUIRED');
  }

  return {
    version: version as ThueApiBankContract['version'],
    baseUrl: parsedBaseUrl.toString(),
    endpoint,
    method,
    accountScoped,
    auth: {
      location: authLocation as ThueApiBankContract['auth']['location'],
      name: authName,
      prefix: optionalString(auth, 'prefix') ?? '',
    },
    pagination: {
      requestCursorName: optionalString(pagination, 'requestCursorName'),
      responseCursorPath: optionalString(pagination, 'responseCursorPath'),
    },
    response: {
      itemsPath: requiredString(response, 'itemsPath', 'CONTRACT_ITEMS_PATH_REQUIRED'),
      statusPath: optionalString(response, 'statusPath'),
      successValues: parseStringArray(response.successValues, ['success']),
    },
    fields: {
      providerEventId: requiredString(fields, 'providerEventId', 'CONTRACT_EVENT_ID_FIELD_REQUIRED'),
      transactionAt: requiredString(fields, 'transactionAt', 'CONTRACT_TRANSACTION_TIME_FIELD_REQUIRED'),
      direction: requiredString(fields, 'direction', 'CONTRACT_DIRECTION_FIELD_REQUIRED'),
      amount: requiredString(fields, 'amount', 'CONTRACT_AMOUNT_FIELD_REQUIRED'),
      content: requiredString(fields, 'content', 'CONTRACT_CONTENT_FIELD_REQUIRED'),
      accountNumber: accountNumberField,
      bankCode: bankCodeField,
      providerReference: optionalString(fields, 'providerReference'),
    },
    directionValues: {
      in: parseStringArray(
        isRecord(directionValues) ? directionValues.in : null,
        ['in', 'credit', 'received', '+'],
      ),
      out: parseStringArray(
        isRecord(directionValues) ? directionValues.out : null,
        ['out', 'debit', 'sent', '-'],
      ),
    },
  };
}

function parseAmount(value: unknown) {
  if (typeof value === 'number') {
    if (Number.isSafeInteger(value) && value >= 0) return value;
    throw new ThueApiBankError('TRANSACTION_AMOUNT_INVALID');
  }
  if (typeof value !== 'string') {
    throw new ThueApiBankError('TRANSACTION_AMOUNT_INVALID');
  }

  const compact = value.trim().replace(/\s|₫|đ|vnd/gi, '');
  if (/^\d+$/.test(compact)) return Number(compact);
  if (/^\d{1,3}(?:[.,]\d{3})+$/.test(compact)) {
    return Number(compact.replace(/[.,]/g, ''));
  }
  if (/^\d+[.,]00$/.test(compact)) {
    return Number(compact.slice(0, -3));
  }
  throw new ThueApiBankError('TRANSACTION_AMOUNT_INVALID');
}

function parseTransactionTime(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new ThueApiBankError('TRANSACTION_TIME_INVALID');
  }
  const raw = value.trim();
  const vietnameseDate = raw.match(
    /^(\d{2})\/(\d{2})\/(\d{4})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/,
  );
  const vietnameseDateOnly = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  const vietnameseParts = vietnameseDate
    ? {
        day: Number(vietnameseDate[1]),
        month: Number(vietnameseDate[2]),
        year: Number(vietnameseDate[3]),
        hour: Number(vietnameseDate[4]),
        minute: Number(vietnameseDate[5]),
        second: Number(vietnameseDate[6] ?? '00'),
        millisecond: 0,
      }
    : vietnameseDateOnly
      ? {
          day: Number(vietnameseDateOnly[1]),
          month: Number(vietnameseDateOnly[2]),
          year: Number(vietnameseDateOnly[3]),
          hour: 23,
          minute: 59,
          second: 59,
          millisecond: 999,
        }
      : null;
  if (vietnameseParts) {
    const { day, month, year, hour, minute, second, millisecond } = vietnameseParts;
    const calendarDate = new Date(Date.UTC(year, month - 1, day));
    if (
      year < 1000 ||
      calendarDate.getUTCFullYear() !== year ||
      calendarDate.getUTCMonth() !== month - 1 ||
      calendarDate.getUTCDate() !== day ||
      hour > 23 ||
      minute > 59 ||
      second > 59
    ) {
      throw new ThueApiBankError('TRANSACTION_TIME_INVALID');
    }
    return new Date(
      Date.UTC(year, month - 1, day, hour - 7, minute, second, millisecond),
    ).toISOString();
  }

  let normalized = raw;
  if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(?::\d{2})?$/.test(raw)) {
    normalized = raw.replace(' ', 'T') + '+07:00';
  }

  const timestamp = Date.parse(normalized);
  if (!Number.isFinite(timestamp)) {
    throw new ThueApiBankError('TRANSACTION_TIME_INVALID');
  }
  return new Date(timestamp).toISOString();
}

function normalizeDirection(value: unknown, contract: ThueApiBankContract) {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (contract.directionValues.in.includes(normalized)) return 'in' as const;
  if (contract.directionValues.out.includes(normalized)) return 'out' as const;
  throw new ThueApiBankError('TRANSACTION_DIRECTION_INVALID');
}

function normalizeTransaction(
  raw: unknown,
  contract: ThueApiBankContract,
): NormalizedPaymentEvent {
  if (!isRecord(raw)) {
    throw new ThueApiBankError('TRANSACTION_RECORD_INVALID');
  }

  const eventId = String(readPath(raw, contract.fields.providerEventId) ?? '').trim();
  const content = String(readPath(raw, contract.fields.content) ?? '').trim();
  const accountNumber = String(readPath(raw, contract.fields.accountNumber) ?? '')
    .replace(/\s+/g, '')
    .trim();
  const bankCode = String(readPath(raw, contract.fields.bankCode) ?? '')
    .trim()
    .toUpperCase();

  if (!eventId) throw new ThueApiBankError('STABLE_EVENT_ID_REQUIRED');
  if (!contract.accountScoped && !accountNumber) {
    throw new ThueApiBankError('TRANSACTION_ACCOUNT_REQUIRED');
  }
  if (!contract.accountScoped && !bankCode) {
    throw new ThueApiBankError('TRANSACTION_BANK_REQUIRED');
  }

  const referenceValue = contract.fields.providerReference
    ? readPath(raw, contract.fields.providerReference)
    : null;

  return {
    provider: 'thueapibank',
    providerEventId: eventId,
    transactionAt: parseTransactionTime(readPath(raw, contract.fields.transactionAt)),
    direction: normalizeDirection(readPath(raw, contract.fields.direction), contract),
    amount: parseAmount(readPath(raw, contract.fields.amount)),
    content,
    accountNumber: accountNumber || null,
    bankCode: bankCode || null,
    providerReference:
      referenceValue === null || referenceValue === undefined
        ? null
        : String(referenceValue).trim() || null,
    raw,
  };
}

export function parseProviderPage(
  payload: unknown,
  contract: ThueApiBankContract,
): ProviderPage {
  if (contract.response.statusPath) {
    const status = String(readPath(payload, contract.response.statusPath) ?? '')
      .trim()
      .toLowerCase();
    if (!contract.response.successValues.includes(status)) {
      throw new ThueApiBankError('PROVIDER_STATUS_NOT_SUCCESS');
    }
  }

  const items = readPath(payload, contract.response.itemsPath);
  if (!Array.isArray(items)) {
    throw new ThueApiBankError('PROVIDER_ITEMS_MALFORMED');
  }

  const events = items.map((item) => normalizeTransaction(item, contract));
  const eventIds = new Set<string>();
  for (const event of events) {
    if (eventIds.has(event.providerEventId)) {
      throw new ThueApiBankError('PROVIDER_EVENT_ID_DUPLICATED_IN_PAGE');
    }
    eventIds.add(event.providerEventId);
  }

  const cursorValue = readPath(payload, contract.pagination.responseCursorPath);
  return {
    events,
    nextCursor:
      cursorValue === null || cursorValue === undefined
        ? null
        : String(cursorValue).trim() || null,
  };
}

export function extractPaymentCode(content: string) {
  const matches = Array.from(content.matchAll(paymentCodePattern), (match) =>
    match[1].toUpperCase(),
  );
  return matches.length === 1 ? matches[0] : '';
}

export function buildProviderRequest(
  contract: ThueApiBankContract,
  apiKey: string,
  cursor: string | null,
) {
  if (!apiKey.trim()) throw new ThueApiBankError('API_KEY_REQUIRED');
  const credential = contract.auth.prefix + apiKey.trim();
  const endpoint = contract.auth.location === 'path'
    ? contract.endpoint.replaceAll(contract.auth.name, encodeURIComponent(credential))
    : contract.endpoint;
  const url = new URL(endpoint, contract.baseUrl);
  const headers = new Headers({ Accept: 'application/json' });

  if (contract.auth.location === 'header') {
    headers.set(contract.auth.name, credential);
  } else if (contract.auth.location === 'query') {
    url.searchParams.set(contract.auth.name, credential);
  }

  if (
    cursor &&
    contract.pagination.requestCursorName &&
    contract.method === 'GET'
  ) {
    url.searchParams.set(contract.pagination.requestCursorName, cursor);
  }

  if (contract.method === 'POST') {
    headers.set('Content-Type', 'application/json');
  }

  return {
    url: url.toString(),
    init: {
      method: contract.method,
      headers,
      body:
        contract.method === 'POST'
          ? JSON.stringify(
              cursor && contract.pagination.requestCursorName
                ? { [contract.pagination.requestCursorName]: cursor }
                : {},
            )
          : undefined,
    } satisfies RequestInit,
  };
}

export function highestContractVersion(contracts: ThueApiBankContract[]) {
  const rank = { v1: 1, v2: 2, v3: 3 } as const;
  return [...contracts].sort((a, b) => rank[b.version] - rank[a.version])[0] ?? null;
}
