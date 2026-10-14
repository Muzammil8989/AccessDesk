import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

/**
 * A small M3 label (the look of an assist chip, not clickable): 24px high, 8px radius, a tonal
 * container colour. Status words always come with an icon, so colour is never the only signal.
 */
const badgeVariants = cva(
  'inline-flex h-6 w-fit items-center gap-1 rounded-sm px-2 text-label-medium whitespace-nowrap [&>svg]:size-3.5 [&>svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'bg-primary-container text-on-primary-container',
        secondary: 'bg-surface-container-highest text-on-surface-variant',
        success: 'bg-success-container text-on-success-container',
        warning: 'bg-warning-container text-on-warning-container',
        destructive: 'bg-error-container text-on-error-container',
        outline: 'border border-outline text-on-surface-variant',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);

export function Badge({
  className,
  variant,
  ...props
}: ComponentProps<'span'> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
