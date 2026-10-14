import { cva, type VariantProps } from 'class-variance-authority';
import { CircleAlert, CircleCheck, Info, TriangleAlert, type LucideIcon } from 'lucide-react';
import type { ComponentProps, ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** An M3 banner: a container colour, 12px radius, no outline. The icon has no background. */
const alertVariants = cva('flex items-start gap-3 rounded-md p-4 text-body-medium', {
  variants: {
    variant: {
      info: 'bg-info-container text-on-info-container',
      success: 'bg-success-container text-on-success-container',
      warning: 'bg-warning-container text-on-warning-container',
      destructive: 'bg-error-container text-on-error-container',
    },
  },
  defaultVariants: { variant: 'info' },
});

type AlertVariant = NonNullable<VariantProps<typeof alertVariants>['variant']>;

const ICONS: Record<AlertVariant, LucideIcon> = {
  info: Info,
  success: CircleCheck,
  warning: TriangleAlert,
  destructive: CircleAlert,
};

/**
 * A callout with an icon, so the meaning never rests on colour alone. It has no live-region
 * role of its own: pass `role="alert"` for something that just went wrong, or `role="status"`
 * for a result the user asked for.
 */
export function Alert({
  variant = 'info',
  icon,
  className,
  children,
  ...props
}: ComponentProps<'div'> & VariantProps<typeof alertVariants> & { icon?: ReactNode }) {
  const Icon = ICONS[variant ?? 'info'];
  return (
    <div className={cn(alertVariants({ variant }), className)} {...props}>
      {icon ?? <Icon className="mt-0.5 size-5 shrink-0" aria-hidden="true" />}
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

export function AlertTitle({ className, ...props }: ComponentProps<'p'>) {
  return <p data-slot="alert-title" className={cn('text-title-small', className)} {...props} />;
}

export function AlertDescription({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('mt-1', className)} {...props} />;
}
