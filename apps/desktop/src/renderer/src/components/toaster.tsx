import { CircleAlert, CircleCheck, Info, X, type LucideIcon } from 'lucide-react';
import { dismissToast, useToasts, type ToastKind } from '@/lib/toast';
import { cn } from '@/lib/utils';

const ICONS: Record<ToastKind, { icon: LucideIcon; className: string }> = {
  success: { icon: CircleCheck, className: 'text-success' },
  info: { icon: Info, className: 'text-info' },
  error: { icon: CircleAlert, className: 'text-destructive' },
};

/**
 * Mount once, at the root. The two live regions are always in the page, so a notice added to
 * one is announced: polite for the routine ones, assertive for errors.
 */
export function Toaster() {
  const toasts = useToasts();
  const routine = toasts.filter((item) => item.kind !== 'error');
  const errors = toasts.filter((item) => item.kind === 'error');

  const renderToast = (item: (typeof toasts)[number]) => {
    const { icon: Icon, className } = ICONS[item.kind];
    return (
      <div
        key={item.id}
        className="pointer-events-auto flex items-start gap-3 rounded-lg border bg-card p-4 text-sm text-card-foreground shadow-md duration-200 animate-in fade-in slide-in-from-bottom-2"
      >
        <Icon className={cn('mt-0.5 size-4 shrink-0', className)} aria-hidden="true" />
        <p className="min-w-0 flex-1">{item.message}</p>
        <button
          type="button"
          aria-label="Dismiss notification"
          onClick={() => dismissToast(item.id)}
          className="-m-1.5 flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground outline-none transition-colors duration-150 ease-standard hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      </div>
    );
  };

  return (
    <div
      role="region"
      aria-label="Notifications"
      className="pointer-events-none fixed right-4 bottom-4 z-50 flex w-96 max-w-[calc(100vw-2rem)] flex-col gap-2"
    >
      <div role="status" className="flex flex-col gap-2">
        {routine.map(renderToast)}
      </div>
      <div role="alert" className="flex flex-col gap-2">
        {errors.map(renderToast)}
      </div>
    </div>
  );
}
