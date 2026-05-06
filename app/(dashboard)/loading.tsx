import { PageSkeleton } from '@/components/Skeleton';

// Dashboard route-segment loader. Streams while the server fetches stats.
// Renders inside the dashboard layout, so the sidebar is already painted —
// only the main content gets skeleton'd.
export default function Loading() {
  return <PageSkeleton />;
}
