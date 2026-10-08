import { cn } from '@/lib/utils';

export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const letters =
    words.length > 1
      ? `${words[0]?.[0] ?? ''}${words.at(-1)?.[0] ?? ''}`
      : (words[0] ?? '').slice(0, 2);
  return letters.toUpperCase() || '?';
}

/** Initials in a circle. Decorative: the person's name is always shown as text beside it. */
export function Avatar({ name, className }: { name: string; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'flex size-8 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-semibold text-accent-foreground',
        className,
      )}
    >
      {initialsOf(name)}
    </span>
  );
}
