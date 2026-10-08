import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

export function Card({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={cn(
        'flex flex-col gap-6 rounded-xl border bg-card py-6 text-card-foreground shadow-sm',
        className,
      )}
      {...props}
    />
  );
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
    <Heading className={cn('leading-none font-semibold', className)} {...props}>
      {children}
    </Heading>
  );
}

export function CardDescription({ className, ...props }: ComponentProps<'p'>) {
  return <p className={cn('text-sm text-muted-foreground', className)} {...props} />;
}

export function CardContent({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('px-6', className)} {...props} />;
}

export function CardFooter({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('flex items-center px-6', className)} {...props} />;
}
