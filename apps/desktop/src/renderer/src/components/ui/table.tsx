import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

/**
 * `containerClassName` styles the scroll wrapper. Give it a max height and `overflow-auto`
 * and the header row (sticky) stays in view while the body scrolls.
 */
export function Table({
  className,
  containerClassName,
  ...props
}: ComponentProps<'table'> & { containerClassName?: string }) {
  return (
    <div className={cn('relative w-full overflow-x-auto', containerClassName)}>
      <table className={cn('w-full caption-bottom text-sm', className)} {...props} />
    </div>
  );
}

export function TableHeader({ className, ...props }: ComponentProps<'thead'>) {
  return <thead className={cn('[&_tr]:border-b', className)} {...props} />;
}

export function TableBody({ className, ...props }: ComponentProps<'tbody'>) {
  return <tbody className={cn('[&_tr:last-child]:border-0', className)} {...props} />;
}

export function TableRow({ className, ...props }: ComponentProps<'tr'>) {
  return (
    <tr
      className={cn(
        'border-b transition-colors duration-150 ease-standard hover:bg-muted/50',
        className,
      )}
      {...props}
    />
  );
}

export function TableHead({ className, ...props }: ComponentProps<'th'>) {
  return (
    <th
      className={cn(
        'sticky top-0 z-10 h-10 bg-muted px-4 text-left align-middle text-xs font-semibold tracking-wide whitespace-nowrap text-muted-foreground uppercase',
        className,
      )}
      {...props}
    />
  );
}

export function TableCell({ className, ...props }: ComponentProps<'td'>) {
  return <td className={cn('px-4 py-3 align-middle', className)} {...props} />;
}
