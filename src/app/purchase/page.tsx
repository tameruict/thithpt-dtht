import { redirect } from 'next/navigation';
import {
  getCheckoutBankDetails,
  getPaymentPollFunctionConfig,
  isKeyPurchaseEnabled,
} from '@/lib/payments/config';
import { createClient } from '@/lib/supabase/server';
import PurchaseClient, {
  type CheckoutBankDetails,
  type PurchaseProduct,
} from './PurchaseClient';

export const dynamic = 'force-dynamic';

export default async function PurchasePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Keep the intended destination so a session that expires between
  // navigation and the server render can return to checkout after login.
  if (!user) redirect('/?redirect=%2Fpurchase');

  const purchaseEnabled = isKeyPurchaseEnabled();
  let bankDetails: CheckoutBankDetails | null = null;
  if (purchaseEnabled) {
    try {
      getPaymentPollFunctionConfig();
      bankDetails = getCheckoutBankDetails();
    } catch {
      bankDetails = null;
    }
  }

  const checkoutReady = purchaseEnabled && Boolean(bankDetails);
  const { data } = checkoutReady
    ? await supabase
        .from('key_products')
        .select(
          'id,code,name,product_kind,attempt_count,price_amount,currency,valid_days',
        )
        .eq('is_active', true)
        .eq('product_kind', 'bundle')
        .eq('currency', 'VND')
        .is('archived_at', null)
        .order('price_amount', { ascending: true })
    : { data: [] };

  return (
    <PurchaseClient
      products={(data ?? []) as PurchaseProduct[]}
      enabled={checkoutReady}
      bankDetails={bankDetails}
    />
  );
}
