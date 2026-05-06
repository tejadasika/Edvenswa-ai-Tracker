import { PageSkeleton } from '@/components/Skeleton';

// Admin route-segment loader. Same shape as the dashboard one, since
// admin pages have a similar header + stats + chart + table layout.
export default function Loading() {
  return <PageSkeleton />;
}
