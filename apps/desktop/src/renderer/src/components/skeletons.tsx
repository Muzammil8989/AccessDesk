import { Skeleton } from '@/components/ui/skeleton';

/** Placeholder for a page body while its feature check or data is pending. */
export function PageSkeleton() {
  return (
    <div role="status" aria-label="Loading page">
      <PageSkeletonBody />
    </div>
  );
}

/** Placeholder for the whole signed-in shell (sidebar + page) while the session is read. */
export function ShellSkeleton() {
  return (
    <div role="status" aria-label="Loading AccessDesk" className="flex h-screen">
      <div className="flex w-64 shrink-0 flex-col gap-3 border-r bg-sidebar p-4">
        <Skeleton className="h-8 w-36" />
        <div className="mt-4 flex flex-col gap-2">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-9 w-full" />
          ))}
        </div>
      </div>
      <div className="flex-1 p-8">
        <div className="mx-auto w-full max-w-6xl">
          <PageSkeletonBody />
        </div>
      </div>
    </div>
  );
}

function PageSkeletonBody() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-72 max-w-full" />
      </div>
      <Skeleton className="h-64 w-full" />
    </div>
  );
}

/** Placeholder for the centred card pages (setup, sign-in, no access). */
export function CenteredCardSkeleton() {
  return (
    <div role="status" aria-label="Loading" className="grid min-h-screen place-items-center p-6">
      <div className="flex w-full max-w-sm flex-col gap-4 rounded-xl border bg-card p-6 shadow-sm">
        <Skeleton className="size-10 rounded-lg" />
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    </div>
  );
}
