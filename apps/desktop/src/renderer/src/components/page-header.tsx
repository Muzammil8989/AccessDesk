import { useEffect, useRef, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function PageHeader({
  title,
  description,
  actions,
  className,
  focusOnMount = false,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
  /** Moves keyboard focus to the heading when the screen opens, so a screen reader starts there. */
  focusOnMount?: boolean;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (focusOnMount) heading.current?.focus();
  }, [focusOnMount]);

  return (
    <header className={cn('flex flex-wrap items-end justify-between gap-4', className)}>
      <div className="min-w-0">
        <h1
          ref={heading}
          tabIndex={focusOnMount ? -1 : undefined}
          className="text-2xl font-semibold tracking-tight outline-none"
        >
          {title}
        </h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </header>
  );
}
