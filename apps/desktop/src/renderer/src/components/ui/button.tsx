import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

/**
 * M3 buttons: pill-shaped, label-large. `default` is the filled button, `secondary` the tonal one,
 * `outline` the outlined one and `ghost` the text button. Hover, focus and press are shown by the
 * state layer; a disabled button uses the M3 disabled colours (12% container, 38% content).
 */
const buttonVariants = cva(
  "state-layer inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-full text-label-large whitespace-nowrap transition-shadow duration-150 ease-standard outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:bg-on-surface/12 disabled:text-on-surface/38 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-[18px]",
  {
    variants: {
      variant: {
        default: 'bg-primary text-on-primary hover:shadow-elevation-1',
        destructive: 'bg-error text-on-error hover:shadow-elevation-1',
        outline:
          'border border-outline bg-transparent text-primary disabled:border-on-surface/12 disabled:bg-transparent',
        secondary: 'bg-secondary-container text-on-secondary-container hover:shadow-elevation-1',
        ghost: 'bg-transparent text-primary disabled:bg-transparent',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-10 px-6 py-2',
        sm: 'h-8 gap-1.5 px-4',
        lg: 'h-12 px-8',
        icon: 'size-10',
      },
    },
    compoundVariants: [
      // M3 text buttons have less padding, because they have no container.
      { variant: 'ghost', size: 'default', className: 'px-3' },
      { variant: 'ghost', size: 'sm', className: 'px-2' },
    ],
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

type ButtonProps = ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & { asChild?: boolean };

export function Button({ className, variant, size, asChild = false, ...props }: ButtonProps) {
  const Comp = asChild ? Slot : 'button';
  return <Comp className={cn(buttonVariants({ variant, size, className }))} {...props} />;
}

export { buttonVariants };
