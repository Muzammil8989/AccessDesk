import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import { createContext, useContext, type ComponentProps, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** True below a TooltipProvider, so a Tooltip knows not to add its own. */
const HasProvider = createContext(false);

/**
 * Shares one open delay between neighbouring tooltips: once one is open, moving to the next shows
 * it at once. Wrap a group of controls (the sidebar) in one.
 */
export function TooltipProvider({
  delayDuration = 200,
  skipDelayDuration = 200,
  ...props
}: ComponentProps<typeof TooltipPrimitive.Provider>) {
  return (
    <HasProvider.Provider value>
      <TooltipPrimitive.Provider
        delayDuration={delayDuration}
        skipDelayDuration={skipDelayDuration}
        {...props}
      />
    </HasProvider.Provider>
  );
}

/** Uses the nearest TooltipProvider, or brings its own so it works anywhere, tests included. */
export function Tooltip(props: ComponentProps<typeof TooltipPrimitive.Root>) {
  const shared = useContext(HasProvider);
  if (shared) return <TooltipPrimitive.Root {...props} />;
  return (
    <TooltipProvider>
      <TooltipPrimitive.Root {...props} />
    </TooltipProvider>
  );
}

export const TooltipTrigger = TooltipPrimitive.Trigger;

export function TooltipContent({
  className,
  sideOffset = 8,
  children,
  ...props
}: ComponentProps<typeof TooltipPrimitive.Content>) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        sideOffset={sideOffset}
        className={cn(
          'z-50 flex max-w-xs items-center gap-2 rounded-md bg-tooltip px-2.5 py-1.5 text-xs font-medium text-tooltip-foreground shadow-md',
          'animate-in fade-in-0 zoom-in-95 duration-150 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95',
          className,
        )}
        {...props}
      >
        {children}
        <TooltipPrimitive.Arrow className="fill-tooltip" width={10} height={5} />
      </TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>
  );
}

/** A keyboard shortcut shown inside a tooltip. Decorative: the action is named in the label. */
export function TooltipKbd({ children }: { children: ReactNode }) {
  return (
    <kbd
      aria-hidden="true"
      className="rounded border border-tooltip-foreground/20 px-1.5 font-sans text-[11px] text-tooltip-foreground/80"
    >
      {children}
    </kbd>
  );
}

/**
 * Wraps one control in a tooltip. Pass `disabled` to render the control alone (for example when
 * the sidebar is expanded and the label is already on screen).
 */
export function WithTooltip({
  label,
  side = 'right',
  disabled = false,
  children,
}: {
  label: ReactNode;
  side?: ComponentProps<typeof TooltipPrimitive.Content>['side'];
  disabled?: boolean;
  children: ReactNode;
}) {
  if (disabled) return <>{children}</>;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side={side}>{label}</TooltipContent>
    </Tooltip>
  );
}
