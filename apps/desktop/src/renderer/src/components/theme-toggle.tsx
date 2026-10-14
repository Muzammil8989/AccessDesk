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
 * Light / Dark / System, as an M3 segmented button. `compact` collapses it to one icon button
 * that cycles through the three, for the icon-only sidebar.
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
            'state-layer flex size-10 cursor-pointer items-center justify-center rounded-full text-on-surface-variant outline-none focus-visible:ring-2 focus-visible:ring-primary',
            className,
          )}
        >
          <Icon className="size-5" aria-hidden="true" />
        </button>
      </WithTooltip>
    );
  }

  return (
    <div
      role="group"
      aria-label="Theme"
      className={cn('flex h-10 overflow-hidden rounded-full border border-outline', className)}
    >
      {OPTIONS.map(({ value, label, icon: Icon }) => (
        <WithTooltip key={value} label={`${label} theme`} side="top">
          <button
            type="button"
            aria-pressed={theme === value}
            aria-label={`${label} theme`}
            onClick={() => setTheme(value)}
            className={cn(
              'state-layer flex flex-1 cursor-pointer items-center justify-center border-l border-outline outline-none first:border-l-0 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset',
              theme === value
                ? 'bg-secondary-container text-on-secondary-container'
                : 'text-on-surface-variant',
            )}
          >
            <Icon className="size-[18px]" aria-hidden="true" />
          </button>
        </WithTooltip>
      ))}
    </div>
  );
}
