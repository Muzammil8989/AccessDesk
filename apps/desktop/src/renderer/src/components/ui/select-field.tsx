import { ChevronDown } from 'lucide-react';
import type { ComponentProps } from 'react';
import type { FieldError } from 'react-hook-form';
import { cn } from '@/lib/utils';
import { Label } from './label';

interface SelectFieldProps extends ComponentProps<'select'> {
  id: string;
  label: string;
  hint?: string;
  error?: FieldError;
}

/** A real `<select>` (native keyboard, screen-reader and test semantics) with a styled chevron. */
export function SelectField({
  id,
  label,
  hint,
  error,
  className,
  children,
  ...selectProps
}: SelectFieldProps) {
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <select
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={
            [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ') || undefined
          }
          className={cn(
            'h-10 w-full min-w-0 cursor-pointer appearance-none rounded-md border border-input bg-card py-1 pr-9 pl-3 text-base shadow-xs transition-colors duration-150 ease-standard outline-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
            'focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/30',
            'aria-invalid:border-destructive aria-invalid:ring-destructive/20',
            className,
          )}
          {...selectProps}
        >
          {children}
        </select>
        <ChevronDown
          className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
      </div>
      {hint && (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} role="alert" className="text-xs text-destructive">
          {error.message}
        </p>
      )}
    </div>
  );
}
