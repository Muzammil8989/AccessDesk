import { Monitor, Moon, Sun, type LucideIcon } from 'lucide-react';
import { WithTooltip } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { useTheme, type Theme } from '@/lib/theme';

const OPTIONS: { value: Theme; label: string; icon: LucideIcon }[] = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
];

/**
 * Light / Dark / System. `compact` collapses it to one button that cycles through the
 * three, for the icon-only sidebar.
 */
export function ThemeToggle({
  className,
  compact = false,
}: {
  className?: string;
  compact?: boolean;
}) {
  const [theme, setTheme] = useTheme();

  if (compact) {
    const index = OPTIONS.findIndex((option) => option.value === theme);
    const current = OPTIONS[index] ?? OPTIONS[2]!;
    const next = OPTIONS[(index + 1) % OPTIONS.length]!;
    const Icon = current.icon;
    return (
      <WithTooltip label={`Theme: ${current.label}. Switch to ${next.label}`}>
        <button
          type="button"
          aria-label={`Theme: ${current.label}. Switch to ${next.label}`}
          onClick={() => setTheme(next.value)}
          className={cn(
            'flex size-10 cursor-pointer items-center justify-center rounded-md text-muted-foreground outline-none transition-colors duration-150 ease-standard hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring',
            className,
          )}
        >
          <Icon className="size-4" aria-hidden="true" />
        </button>
      </WithTooltip>
    );
  }

  return (
    <div
      role="group"
      aria-label="Theme"
      className={cn('flex gap-1 rounded-md bg-muted p-1', className)}
    >
      {OPTIONS.map(({ value, label, icon: Icon }) => (
        <WithTooltip key={value} label={`${label} theme`} side="top">
          <button
            type="button"
            aria-pressed={theme === value}
            aria-label={`${label} theme`}
            onClick={() => setTheme(value)}
            className={cn(
              'flex h-8 flex-1 cursor-pointer items-center justify-center rounded-sm outline-none transition-colors duration-150 ease-standard focus-visible:ring-2 focus-visible:ring-ring',
              theme === value
                ? 'bg-card text-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <Icon className="size-4" aria-hidden="true" />
          </button>
        </WithTooltip>
      ))}
    </div>
  );
}
