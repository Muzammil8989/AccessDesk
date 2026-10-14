import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

/** A bare input. Wrap it in a FieldShell (text fields) or use SearchField (search). */
export function Input({ className, type, ...props }: ComponentProps<'input'>) {
  return (
    <input
      type={type}
      className={cn(
        'w-full min-w-0 bg-transparent text-body-large text-on-surface outline-none placeholder:text-on-surface-variant disabled:cursor-not-allowed disabled:opacity-60',
        className,
      )}
      {...props}
    />
  );
}
