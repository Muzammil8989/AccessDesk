import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

/** M3 cards, 12px radius. `tonal` is a filled card; `outlined` has an outline and no fill. */
const cardVariants = cva('flex flex-col gap-6 rounded-md py-6 text-on-surface', {
  variants: {
    variant: {
      tonal: 'bg-surface-container-low',
      outlined: 'border border-outline-variant bg-surface',
    },
  },
  defaultVariants: { variant: 'tonal' },
});

export function Card({
  className,
  variant,
  ...props
}: ComponentProps<'div'> & VariantProps<typeof cardVariants>) {
  return <div className={cn(cardVariants({ variant }), className)} {...props} />;
}

export function CardHeader({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('flex flex-col gap-1.5 px-6', className)} {...props} />;
}

/** An `h2` by default. Use `as="h1"` when the card is the whole page (sign-in, setup). */
export function CardTitle({
  as: Heading = 'h2',
  className,
  children,
  ...props
}: ComponentProps<'h2'> & { as?: 'h1' | 'h2' | 'h3' }) {
  return (
    <Heading className={cn('text-title-large', className)} {...props}>
      {children}
    </Heading>
  );
}

export function CardDescription({ className, ...props }: ComponentProps<'p'>) {
  return <p className={cn('text-body-medium text-on-surface-variant', className)} {...props} />;
}

export function CardContent({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('px-6', className)} {...props} />;
}

export function CardFooter({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('flex items-center px-6', className)} {...props} />;
}
