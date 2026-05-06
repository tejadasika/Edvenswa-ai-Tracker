import { Skeleton } from '@/components/Skeleton';

// Top-level loading boundary. This renders BEFORE any group layout has
// streamed in (e.g. before /(dashboard)/layout decides whether to show the
// sidebar). Keep it minimal — just a centered skeleton that hints "page
// is coming" without faking sidebar chrome that may or may not appear.
export default function Loading() {
  return (
    <div className="min-h-screen w-full bg-app p-8">
      <div className="mx-auto max-w-3xl space-y-4">
        <Skeleton height={28} width={220} />
        <Skeleton height={14} width={360} />
        <div className="grid grid-cols-3 gap-4 pt-4">
          <Skeleton height={80} />
          <Skeleton height={80} />
          <Skeleton height={80} />
        </div>
      </div>
    </div>
  );
}
