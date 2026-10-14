import { Search } from 'lucide-react';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';
import { Input } from './input';

/**
 * An M3 search bar: a full-radius, tonal bar with a leading search icon. The caller gives it an
 * `aria-label`, because the bar has no visible label.
 */
export function SearchField({ className, ...props }: Omit<ComponentProps<'input'>, 'type'>) {
  return (
    <div className="relative">
      <Search
        className="pointer-events-none absolute top-1/2 left-4 z-10 size-5 -translate-y-1/2 text-on-surface-variant"
        aria-hidden="true"
      />
      <Input
        type="search"
        className={cn(
          'state-layer h-14 rounded-full bg-surface-container-high pr-4 pl-12 focus-visible:ring-2 focus-visible:ring-primary',
          className,
        )}
        {...props}
      />
    </div>
  );
}
