import { CircleAlert } from 'lucide-react';
import type { ComponentProps, ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Label } from './label';

/*
 * The parts of an M3 filled text field, shared by FormField (text, email, date) and SelectField.
 * The container holds the tonal fill and the bottom indicator (1px, 2px primary on focus, 2px
 * error when invalid); the label sits inside it and floats up when the field has focus or a value.
 */

/** Classes for the `<input>` or `<select>` itself. It must come before its label in the markup. */
export const FIELD_CONTROL =
  'peer h-14 w-full min-w-0 appearance-none bg-transparent px-4 pt-6 pb-2 text-body-large text-on-surface outline-none placeholder:text-transparent focus:placeholder:text-on-surface-variant disabled:cursor-not-allowed';

export function FieldShell({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={cn(
        'state-layer relative rounded-t-xs bg-surface-container-highest shadow-[inset_0_-1px_0_var(--on-surface-variant)] transition-shadow duration-150 ease-standard focus-within:shadow-[inset_0_-2px_0_var(--primary)] has-[[aria-invalid=true]]:shadow-[inset_0_-2px_0_var(--error)] has-[:disabled]:opacity-60',
        className,
      )}
      {...props}
    />
  );
}

/** Rests inside the field like a placeholder, and floats to the top when `floated` or on focus. */
export function FieldLabel({
  htmlFor,
  floated = false,
  children,
}: {
  htmlFor: string;
  /** Always float, for controls that show something even when empty (a select, a date). */
  floated?: boolean;
  children: ReactNode;
}) {
  return (
    <Label
      htmlFor={htmlFor}
      className={cn(
        'pointer-events-none absolute top-4 right-4 left-4 origin-top-left truncate text-body-large text-on-surface-variant transition-transform duration-150 ease-standard',
        'peer-focus:-translate-y-2 peer-focus:scale-75 peer-focus:text-primary peer-aria-invalid:text-error',
        'peer-[:not(:placeholder-shown)]:-translate-y-2 peer-[:not(:placeholder-shown)]:scale-75',
        floated && '-translate-y-2 scale-75',
      )}
    >
      {children}
    </Label>
  );
}

/** Supporting text under a field. `hidden` keeps it for screen readers only. */
export function FieldHint({
  id,
  hidden = false,
  children,
}: {
  id: string;
  hidden?: boolean;
  children: ReactNode;
}) {
  return (
    <p id={id} className={hidden ? 'sr-only' : 'px-4 text-body-small text-on-surface-variant'}>
      {children}
    </p>
  );
}

export function FieldError({ id, children }: { id: string; children: ReactNode }) {
  return (
    <p id={id} role="alert" className="flex items-start gap-1 px-4 text-body-small text-error">
      <CircleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
      {children}
    </p>
  );
}
