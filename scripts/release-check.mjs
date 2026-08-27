const strict = process.argv.includes('--strict');

const requiredForPreview = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
  'NEXT_PUBLIC_TURNSTILE_SITE_KEY',
];

const missing = requiredForPreview.filter((name) => !process.env[name]?.trim());
const forbidden = [
  'NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY',
  'NEXT_PUBLIC_SUPABASE_SECRET_KEY',
  ...Object.keys(process.env).filter(
    (name) =>
      name.startsWith('NEXT_PUBLIC_THUEAPIBANK_') ||
      name.startsWith('NEXT_PUBLIC_PAYMENT_BANK_'),
  ),
].filter((name, index, values) => process.env[name]?.trim() && values.indexOf(name) === index);
const purchaseEnabled = process.env.KEY_PURCHASE_ENABLED?.trim();
const checkoutEnv = [
  'PAYMENT_PROVIDER',
  'PAYMENT_BANK_CODE',
  'PAYMENT_BANK_ACCOUNT',
  'THUEAPIBANK_POLL_SECRET',
];
const missingCheckoutEnv =
  purchaseEnabled?.toLowerCase() === 'true'
    ? checkoutEnv.filter((name) => !process.env[name]?.trim())
    : [];

console.log(`RELEASE_CHECK_MODE=${strict ? 'strict' : 'report'}`);
console.log(`MISSING_PREVIEW_ENV=${missing.join(',') || 'none'}`);
console.log(`FORBIDDEN_PUBLIC_SECRET=${forbidden.join(',') || 'none'}`);
console.log(`KEY_PURCHASE_ENABLED=${purchaseEnabled || 'unset'}`);
console.log(`MISSING_CHECKOUT_ENV=${missingCheckoutEnv.join(',') || 'none'}`);

if (forbidden.length > 0) {
  console.error('Release configuration exposes a server-only Supabase secret.');
  process.exit(1);
}

if (purchaseEnabled && !['true', 'false'].includes(purchaseEnabled.toLowerCase())) {
  console.error('KEY_PURCHASE_ENABLED must be true or false.');
  process.exit(1);
}

if (
  purchaseEnabled?.toLowerCase() === 'true' &&
  process.env.PAYMENT_PROVIDER?.trim().toLowerCase() !== 'thueapibank'
) {
  console.error('PAYMENT_PROVIDER must be thueapibank when checkout is enabled.');
  process.exit(1);
}

if (missingCheckoutEnv.length > 0) {
  console.error('Checkout is enabled but server-only payment configuration is incomplete.');
  process.exit(1);
}

if (strict && missing.length > 0) {
  console.error('Preview deployment is missing required public configuration.');
  process.exit(1);
}

console.log('RELEASE_CHECK_RESULT=pass');
