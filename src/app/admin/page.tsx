import { requireAdmin } from '@/lib/supabase/admin';
import AdminDashboardClient from './AdminDashboardClient';

export const dynamic = 'force-dynamic';

export default async function AdminPage() {
  await requireAdmin();
  return <AdminDashboardClient />;
}
