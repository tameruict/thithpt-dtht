import { requireAdmin } from '@/lib/supabase/admin';
import KeyProductsClient from './KeyProductsClient';

export const dynamic = 'force-dynamic';

export default async function KeyProductsPage() {
  await requireAdmin();
  return <KeyProductsClient />;
}
