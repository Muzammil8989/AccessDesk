import { CalendarDays } from 'lucide-react';
import type { ComponentProps } from 'react';
import type { FieldError as FieldErrorValue } from 'react-hook-form';
import { cn } from '@/lib/utils';
import { FIELD_CONTROL, FieldError, FieldHint, FieldLabel, FieldShell } from './field';
import { Input } from './input';

/**
 * A date input opens its picker only from the small native icon. This stretches that (invisible)
 * icon over the whole field so a click anywhere opens the picker, and `DateIcon` draws a themed
 * one in its place, since the native icon is dark on the dark theme.
 */
const DATE_PICKER_TRIGGER =
  'pr-12 [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:inset-0 [&::-webkit-calendar-picker-indicator]:h-full [&::-webkit-calendar-picker-indicator]:w-full [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-0';

function DateIcon() {
  return (
    <CalendarDays
      aria-hidden="true"
      className="pointer-events-none absolute top-1/2 right-4 size-5 -translate-y-1/2 text-on-surface-variant"
    />
  );
}

interface FormFieldProps extends ComponentProps<typeof Input> {
  id: string;
  label: string;
  hint?: string;
  error?: FieldErrorValue;
}

/** An M3 filled text field with a floating label, optional supporting text and an error message. */
export function FormField({ id, label, hint, error, className, ...inputProps }: FormFieldProps) {
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const isDate = inputProps.type === 'date';
  return (
    <div className="flex flex-col gap-1">
      <FieldShell className={className}>
        <Input
          id={id}
          // The floating label needs a placeholder to tell an empty field from a filled one.
          placeholder=" "
          aria-invalid={error ? true : undefined}
          aria-describedby={
            [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ') || undefined
          }
          {...inputProps}
          className={cn(FIELD_CONTROL, isDate && DATE_PICKER_TRIGGER)}
        />
        {isDate && <DateIcon />}
        <FieldLabel htmlFor={id} floated={isDate}>
          {label}
        </FieldLabel>
      </FieldShell>
      {hint && <FieldHint id={hintId}>{hint}</FieldHint>}
      {error && <FieldError id={errorId}>{error.message}</FieldError>}
    </div>
  );
}
