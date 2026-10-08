import { LockKeyhole } from 'lucide-react';
import { cn } from '@/lib/utils';

/** The AccessDesk logo mark. Decorative: the product name is always written next to it. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-xs',
        className,
      )}
    >
      <LockKeyhole className="size-4" />
    </span>
  );
}
