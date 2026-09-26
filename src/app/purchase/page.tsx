import { redirect } from 'next/navigation';
import {
  getCheckoutBankDetails,
  getPaymentPollFunctionConfig,
  isKeyPurchaseEnabled,
} from '@/lib/payments/config';
import { createClient } from '@/lib/supabase/server';
import PurchaseClient, {
  type CheckoutBankDetails,
  type CurrentAccess,
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
        .select('id,code,name,product_kind,price_amount,currency,valid_days')
        .eq('is_active', true)
        .eq('product_kind', 'subscription')
        .eq('currency', 'VND')
        .is('archived_at', null)
        .order('price_amount', { ascending: true })
    : { data: [] };

  // Đã login (redirect ở trên nếu chưa) — hỏi backend user có đang là VIP còn hạn
  // không để hiện banner + đổi copy nút "Mua ngay" -> "Gia hạn thêm".
  let currentAccess: CurrentAccess | null = null;
  try {
    const { data: accessData } = await supabase.rpc('get_user_access');
    if (accessData && typeof accessData === 'object') {
      currentAccess = accessData as CurrentAccess;
    }
  } catch {
    currentAccess = null;
  }

  return (
    <PurchaseClient
      products={(data ?? []) as PurchaseProduct[]}
      enabled={checkoutReady}
      bankDetails={bankDetails}
      currentAccess={currentAccess}
    />
  );
}
