import { CircleAlert, CircleCheck, Info, X, type LucideIcon } from 'lucide-react';
import { dismissToast, useToasts, type ToastKind } from '@/lib/toast';
import { cn } from '@/lib/utils';

const ICONS: Record<ToastKind, { icon: LucideIcon; className: string }> = {
  success: { icon: CircleCheck, className: 'bg-inverse-surface text-inverse-on-surface' },
  info: { icon: Info, className: 'bg-inverse-surface text-inverse-on-surface' },
  error: { icon: CircleAlert, className: 'bg-error-container text-on-error-container' },
};

/**
 * Mount once, at the root. The two live regions are always in the page, so a notice added to
 * one is announced: polite for the routine ones, assertive for errors.
 *
 * Each notice is an M3 snackbar: the inverse surface (an error uses the error container), a 4px
 * radius, and a dismiss button.
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
        className={cn(
          'pointer-events-auto flex min-h-12 items-center gap-3 rounded-xs py-2 pr-2 pl-4 text-body-medium shadow-elevation-3 duration-200 animate-in fade-in slide-in-from-bottom-2',
          className,
        )}
      >
        <Icon className="size-5 shrink-0" aria-hidden="true" />
        <p className="min-w-0 flex-1 py-1">{item.message}</p>
        <button
          type="button"
          aria-label="Dismiss notification"
          onClick={() => dismissToast(item.id)}
          className="state-layer flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-current"
        >
          <X className="size-5" aria-hidden="true" />
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
