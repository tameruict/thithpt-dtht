import { requireAdmin } from '@/lib/supabase/admin';
import PurchasesClient from './PurchasesClient';

export const dynamic = 'force-dynamic';

export default async function PurchasesPage() {
  await requireAdmin();
  return <PurchasesClient />;
}
