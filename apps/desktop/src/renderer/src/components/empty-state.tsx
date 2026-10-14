import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

/**
 * What a list shows when it has nothing to show: a plain icon (no background), a title and a line of
 * help, then optional actions. Pass the title and help as children.
 */
export function EmptyState({ icon: Icon, children }: { icon: LucideIcon; children: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
      <Icon className="size-10 text-on-surface-variant" aria-hidden="true" />
      {children}
    </div>
  );
}
