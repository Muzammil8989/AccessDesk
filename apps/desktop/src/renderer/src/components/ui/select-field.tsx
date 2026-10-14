import { ChevronDown } from 'lucide-react';
import type { ComponentProps } from 'react';
import type { FieldError as FieldErrorValue } from 'react-hook-form';
import { cn } from '@/lib/utils';
import { FIELD_CONTROL, FieldError, FieldHint, FieldLabel, FieldShell } from './field';

interface SelectFieldProps extends ComponentProps<'select'> {
  id: string;
  label: string;
  hint?: string;
  /** Keep the hint for screen readers only, when the screen already shows the same thing. */
  hintHidden?: boolean;
  error?: FieldErrorValue;
}

/**
 * A real `<select>` (native keyboard, screen-reader and test semantics) in an M3 filled field. The
 * label stays raised, because a select always shows its current choice.
 */
export function SelectField({
  id,
  label,
  hint,
  hintHidden,
  error,
  className,
  children,
  ...selectProps
}: SelectFieldProps) {
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  return (
    <div className="flex flex-col gap-1">
      <FieldShell>
        <select
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={
            [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ') || undefined
          }
          className={cn(FIELD_CONTROL, 'cursor-pointer pr-12', className)}
          {...selectProps}
        >
          {children}
        </select>
        <FieldLabel htmlFor={id} floated>
          {label}
        </FieldLabel>
        <ChevronDown
          className="pointer-events-none absolute top-1/2 right-4 size-5 -translate-y-1/2 text-on-surface-variant"
          aria-hidden="true"
        />
      </FieldShell>
      {hint && (
        <FieldHint id={hintId} hidden={hintHidden}>
          {hint}
        </FieldHint>
      )}
      {error && <FieldError id={errorId}>{error.message}</FieldError>}
    </div>
  );
}
