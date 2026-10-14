import { Check } from 'lucide-react';
import { useId } from 'react';
import { cn } from '@/lib/utils';

interface SegmentedControlProps<T extends string> {
  label: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
  className?: string;
}

/**
 * An M3 segmented button: a small set of mutually exclusive choices side by side, with a check
 * on the selected one. It is a native radio group, so Tab enters it once and the arrow keys move
 * between the choices.
 */
export function SegmentedControl<T extends string>({
  label,
  value,
  options,
  onChange,
  className,
}: SegmentedControlProps<T>) {
  const name = useId();
  const labelId = useId();
  return (
    <div
      role="radiogroup"
      aria-labelledby={labelId}
      className={cn('flex flex-col gap-1', className)}
    >
      <span id={labelId} className="px-1 text-body-small text-on-surface-variant select-none">
        {label}
      </span>
      <div className="inline-flex h-10 w-fit items-stretch overflow-hidden rounded-full border border-outline">
        {options.map((option) => {
          const selected = value === option.value;
          return (
            <label
              key={option.value}
              className={cn(
                'state-layer flex min-w-16 cursor-pointer items-center justify-center gap-1.5 border-l border-outline px-3 text-label-large select-none first:border-l-0 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary has-[:focus-visible]:ring-inset',
                selected ? 'bg-secondary-container text-on-secondary-container' : 'text-on-surface',
              )}
            >
              <input
                type="radio"
                name={name}
                value={option.value}
                checked={selected}
                onChange={() => onChange(option.value)}
                className="sr-only"
              />
              {selected && <Check className="size-[18px]" aria-hidden="true" />}
              {option.label}
            </label>
          );
        })}
      </div>
    </div>
  );
}
