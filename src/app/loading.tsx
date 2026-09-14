import { RouteLoading } from '@/components/ui/RouteLoading';

/**
 * Fallback streaming cho mọi route (theo docs `loading.js`).
 * Server Component: không nhận params, chỉ render skeleton nhẹ để
 * navigation + prefetch có phản hồi tức thì.
 */
export default function Loading() {
  return <RouteLoading variant="page" label="Đang tải nội dung…" />;
}
