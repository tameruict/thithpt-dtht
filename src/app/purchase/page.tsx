import { redirect } from 'next/navigation';
import {
  getCheckoutBankDetails,
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

  if (!user) redirect('/');

  const enabled = isKeyPurchaseEnabled();
  const { data } = enabled
    ? await supabase
        .from('key_products')
        .select(
          'id,code,name,product_kind,attempt_count,price_amount,currency,valid_days',
        )
        .eq('is_active', true)
        .is('archived_at', null)
        .order('price_amount', { ascending: true })
    : { data: [] };

  let bankDetails: CheckoutBankDetails | null = null;
  if (enabled) {
    try {
      bankDetails = getCheckoutBankDetails();
    } catch {
      bankDetails = null;
    }
  }

  return (
    <PurchaseClient
      products={(data ?? []) as PurchaseProduct[]}
      enabled={enabled && Boolean(bankDetails)}
      bankDetails={bankDetails}
    />
  );
}
