import { LockKeyhole } from 'lucide-react';
import { cn } from '@/lib/utils';

/** The AccessDesk logo mark. Decorative: the product name is always written next to it. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'flex size-10 shrink-0 items-center justify-center rounded-sm bg-primary text-on-primary',
        className,
      )}
    >
      <LockKeyhole className="size-5" />
    </span>
  );
}
