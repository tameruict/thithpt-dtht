import 'server-only';

export type SepayConfig = {
  webhookApiKey: string;
  bankCode: string;
  bankAccount: string;
  accountName: string;
};

export function isKeyPurchaseEnabled() {
  return process.env.KEY_PURCHASE_ENABLED?.trim().toLowerCase() === 'true';
}

export function getSepayConfig(): SepayConfig {
  const values = {
    webhookApiKey: process.env.SEPAY_WEBHOOK_API_KEY?.trim() ?? '',
    bankCode: process.env.SEPAY_BANK_CODE?.trim() ?? '',
    bankAccount: process.env.SEPAY_BANK_ACCOUNT?.trim() ?? '',
    accountName: process.env.SEPAY_ACCOUNT_NAME?.trim() ?? '',
  };

  const missing = Object.entries(values)
    .filter(([, value]) => !value)
    .map(([key]) => key);

  if (missing.length > 0) {
    throw new Error('Missing SePay server configuration: ' + missing.join(', '));
  }

  return values;
}

export function getCheckoutBankDetails() {
  const config = getSepayConfig();
  return {
    bankCode: config.bankCode,
    bankAccount: config.bankAccount,
    accountName: config.accountName,
  };
}
