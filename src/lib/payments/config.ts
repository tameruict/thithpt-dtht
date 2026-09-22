import 'server-only';

export type PaymentConfig = {
  provider: 'thueapibank';
  bankCode: string;
  bankAccount: string;
};

export function isKeyPurchaseEnabled() {
  return process.env.KEY_PURCHASE_ENABLED?.trim().toLowerCase() === 'true';
}

export function getPaymentConfig(): PaymentConfig {
  const values = {
    provider: process.env.PAYMENT_PROVIDER?.trim().toLowerCase() ?? '',
    bankCode: process.env.PAYMENT_BANK_CODE?.trim().toUpperCase() ?? '',
    bankAccount: process.env.PAYMENT_BANK_ACCOUNT?.replace(/\s+/g, '') ?? '',
  };

  const missing = Object.entries(values)
    .filter(([, value]) => !value)
    .map(([key]) => key);

  if (missing.length > 0) {
    throw new Error('Missing payment server configuration: ' + missing.join(', '));
  }

  if (values.provider !== 'thueapibank') {
    throw new Error('Unsupported payment provider.');
  }

  return values as PaymentConfig;
}

export function getCheckoutBankDetails() {
  const config = getPaymentConfig();
  return {
    bankCode: config.bankCode,
    bankAccount: config.bankAccount,
  };
}

export function getWebhookSecret(): string {
  const secret = process.env.THUEAPIBANK_WEBHOOK_SECRET?.trim() ?? '';
  if (!secret) {
    throw new Error('Missing THUEAPIBANK_WEBHOOK_SECRET.');
  }
  return secret;
}

export function getPaymentPollFunctionConfig() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? '';
  const pollSecret = process.env.THUEAPIBANK_POLL_SECRET?.trim() ?? '';
  if (!supabaseUrl || !pollSecret) {
    throw new Error('Missing ThueAPIBank poll function configuration.');
  }
  return {
    url: `${supabaseUrl.replace(/\/$/, '')}/functions/v1/poll-thueapibank`,
    pollSecret,
  };
}
