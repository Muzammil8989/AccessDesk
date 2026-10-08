import { cva, type VariantProps } from 'class-variance-authority';
import { CircleAlert, CircleCheck, Info, TriangleAlert, type LucideIcon } from 'lucide-react';
import type { ComponentProps, ReactNode } from 'react';
import { cn } from '@/lib/utils';

const alertVariants = cva('flex items-start gap-3 rounded-lg border p-4 text-sm', {
  variants: {
    variant: {
      info: 'border-info/30 bg-info/10 [&>svg]:text-info',
      success: 'border-success/30 bg-success/10 [&>svg]:text-success',
      warning: 'border-warning/40 bg-warning/10 [&>svg]:text-warning',
      destructive:
        'border-destructive/40 bg-destructive/10 [&>svg]:text-destructive [&_[data-slot=alert-title]]:text-destructive',
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
      {icon ?? <Icon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />}
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

export function AlertTitle({ className, ...props }: ComponentProps<'p'>) {
  return <p data-slot="alert-title" className={cn('font-medium', className)} {...props} />;
}

export function AlertDescription({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('mt-1 text-muted-foreground', className)} {...props} />;
}
