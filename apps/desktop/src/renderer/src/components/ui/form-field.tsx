import type { ComponentProps } from 'react';
import type { FieldError } from 'react-hook-form';
import { Input } from './input';
import { Label } from './label';

interface FormFieldProps extends ComponentProps<typeof Input> {
  id: string;
  label: string;
  hint?: string;
  error?: FieldError;
}

export function FormField({ id, label, hint, error, ...inputProps }: FormFieldProps) {
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={
          [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ') || undefined
        }
        {...inputProps}
      />
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
