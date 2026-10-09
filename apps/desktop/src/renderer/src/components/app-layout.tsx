import { canAccess, hasAdminAccess, type Feature } from '@accessdesk/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  ScrollText,
  Settings,
  ShieldCheck,
  UserMinus,
  UserPlus,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, Navigate, Outlet, useMatch } from 'react-router';
import { BrandMark } from '@/components/brand';
import { ShellSkeleton } from '@/components/skeletons';
import { ThemeToggle } from '@/components/theme-toggle';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { TooltipKbd, TooltipProvider, WithTooltip } from '@/components/ui/tooltip';
import { useMediaQuery } from '@/hooks/use-media-query';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';
import { authQuery, settingsQuery } from '@/lib/session';

interface NavItem {
  feature: Feature;
  label: string;
  icon: LucideIcon;
  /** The screen exists but is not built yet. */
  soon?: boolean;
}

const NAV_GROUPS: { id: string; label: string; items: NavItem[] }[] = [
  {
    id: 'workforce',
    label: 'Workforce',
    items: [
      { feature: 'employees', label: 'Employees', icon: Users },
      { feature: 'onboard', label: 'Onboard', icon: UserPlus },
      { feature: 'offboard', label: 'Offboard', icon: UserMinus, soon: true },
    ],
  },
  {
    id: 'governance',
    label: 'Governance',
    items: [
      { feature: 'access-review', label: 'Access Review', icon: ShieldCheck, soon: true },
      { feature: 'audit-log', label: 'Audit Log', icon: ScrollText, soon: true },
    ],
  },
];

const SETTINGS_ITEM: NavItem = { feature: 'settings', label: 'Settings', icon: Settings };

/** Below this window width the sidebar starts icon-only (the window minimum is 900px). */
const COMPACT_QUERY = '(max-width: 1099px)';
/** The user's own choice wins over the window width. A per-device convenience, so localStorage. */
const SIDEBAR_STORAGE_KEY = 'accessdesk.sidebar';

function readSavedCollapsed(): boolean | null {
  try {
    const value = window.localStorage.getItem(SIDEBAR_STORAGE_KEY);
    return value === 'collapsed' ? true : value === 'expanded' ? false : null;
  } catch {
    return null;
  }
}

function saveCollapsed(collapsed: boolean): void {
  try {
    window.localStorage.setItem(SIDEBAR_STORAGE_KEY, collapsed ? 'collapsed' : 'expanded');
  } catch {
    // Storage can be blocked; the choice still holds for this session.
  }
}

/** Ctrl+B (Cmd+B on macOS) toggles the sidebar, except while the user is typing. */
function isToggleShortcut(event: KeyboardEvent): boolean {
  if (event.key.toLowerCase() !== 'b' || !(event.ctrlKey || event.metaKey)) return false;
  if (event.altKey || event.shiftKey) return false;
  const target = event.target;
  return !(
    target instanceof HTMLElement &&
    (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
  );
}

function NavItemLink({ item, collapsed }: { item: NavItem; collapsed: boolean }) {
  const { feature, label, icon: Icon, soon } = item;
  const to = `/${feature}`;
  // Worked out here rather than with NavLink's function `className`: the tooltip trigger merges
  // class names as strings, and a function there would wipe every style off the link.
  const isActive = useMatch({ path: to, end: false }) !== null;
  return (
    <WithTooltip
      disabled={!collapsed}
      label={
        <>
          {label}
          {soon && (
            <span className="rounded-full bg-tooltip-foreground/15 px-1.5 py-px text-[11px]">
              Soon
            </span>
          )}
        </>
      }
    >
      <Link
        to={to}
        aria-current={isActive ? 'page' : undefined}
        className={cn(
          'group relative flex h-10 cursor-pointer items-center gap-3 rounded-lg px-3 text-sm font-medium outline-none transition-colors duration-150 ease-standard focus-visible:ring-2 focus-visible:ring-ring',
          collapsed && 'mx-auto size-11 justify-center px-0',
          // "Soon" is generated content: it reads as part of the link name in a browser but
          // stays out of the DOM text.
          soon &&
            !collapsed &&
            "after:ml-auto after:rounded-full after:bg-muted after:px-2 after:py-0.5 after:text-[11px] after:font-medium after:text-muted-foreground after:content-['Soon']",
          isActive
            ? 'bg-primary/10 text-primary dark:bg-primary/15'
            : 'text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
        )}
      >
        {isActive && !collapsed && (
          <span
            aria-hidden="true"
            className="absolute top-2 bottom-2 -left-3 w-[3px] rounded-r-full bg-primary"
          />
        )}
        <Icon className="size-[18px] shrink-0" aria-hidden="true" />
        <span className={cn('truncate', collapsed && 'sr-only')}>{label}</span>
      </Link>
    </WithTooltip>
  );
}

function CollapseToggle({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const label = collapsed ? 'Expand sidebar' : 'Collapse sidebar';
  const Icon = collapsed ? PanelLeftOpen : PanelLeftClose;
  return (
    <WithTooltip
      label={
        <>
          {label}
          <TooltipKbd>Ctrl B</TooltipKbd>
        </>
      }
    >
      <Button
        variant="ghost"
        size="icon"
        className="text-muted-foreground hover:text-foreground"
        aria-controls="sidebar"
        aria-expanded={!collapsed}
        aria-label={label}
        aria-keyshortcuts="Control+B"
        onClick={onToggle}
      >
        <Icon className="size-[18px]" />
      </Button>
    </WithTooltip>
  );
}

function Sidebar({
  user,
  allowed,
  onSignOut,
  signingOut,
}: {
  user: { displayName: string | null; username: string | null };
  allowed: (feature: Feature) => boolean;
  onSignOut: () => void;
  signingOut: boolean;
}) {
  const compact = useMediaQuery(COMPACT_QUERY);
  const [manual, setManual] = useState<boolean | null>(readSavedCollapsed);
  const collapsed = manual ?? compact;

  const toggle = useCallback(() => {
    setManual(!collapsed);
    saveCollapsed(!collapsed);
  }, [collapsed]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!isToggleShortcut(event)) return;
      event.preventDefault();
      toggle();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [toggle]);

  const groups = NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => allowed(item.feature)),
  })).filter((group) => group.items.length > 0);
  const name = user.displayName ?? user.username ?? '';

  return (
    <TooltipProvider delayDuration={100}>
      <aside
        id="sidebar"
        className={cn(
          'flex shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground',
          collapsed ? 'w-[68px]' : 'w-64',
        )}
      >
        <div
          className={cn(
            'flex shrink-0 items-center border-b border-sidebar-border',
            collapsed ? 'flex-col gap-2 py-3' : 'h-16 gap-3 pr-2 pl-4',
          )}
        >
          <BrandMark />
          <div className={cn('min-w-0 flex-1 leading-tight', collapsed && 'sr-only')}>
            <span className="block text-[15px] font-semibold tracking-tight">AccessDesk</span>
            <span className="block truncate text-xs text-muted-foreground">Identity admin</span>
          </div>
          <CollapseToggle collapsed={collapsed} onToggle={toggle} />
        </div>

        <nav aria-label="Main" className="flex flex-1 flex-col gap-5 overflow-y-auto px-3 py-4">
          {groups.map((group, index) => (
            <div key={group.id} className="flex flex-col gap-1">
              {collapsed && index > 0 && (
                <span aria-hidden="true" className="mx-auto mb-3 h-px w-6 bg-sidebar-border" />
              )}
              <p
                id={`nav-group-${group.id}`}
                className={cn(
                  'px-3 pb-1 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase',
                  collapsed && 'sr-only',
                )}
              >
                {group.label}
              </p>
              <ul aria-labelledby={`nav-group-${group.id}`} className="flex flex-col gap-0.5">
                {group.items.map((item) => (
                  <li key={item.feature}>
                    <NavItemLink item={item} collapsed={collapsed} />
                  </li>
                ))}
              </ul>
            </div>
          ))}

          {allowed(SETTINGS_ITEM.feature) && (
            <ul className="mt-auto border-t border-sidebar-border pt-4">
              <li>
                <NavItemLink item={SETTINGS_ITEM} collapsed={collapsed} />
              </li>
            </ul>
          )}
        </nav>

        <div
          className={cn(
            'flex flex-col gap-3 border-t border-sidebar-border p-3',
            collapsed && 'items-center',
          )}
        >
          <ThemeToggle compact={collapsed} />
          <div className={cn('flex items-center gap-2.5', collapsed ? 'flex-col' : 'pl-1')}>
            <WithTooltip
              disabled={!collapsed}
              label={
                <span className="flex flex-col">
                  <span>{name}</span>
                  {user.username && <span className="font-normal opacity-75">{user.username}</span>}
                </span>
              }
            >
              <span className="flex">
                <Avatar name={name} className="size-9" />
              </span>
            </WithTooltip>
            <div className={cn('min-w-0 flex-1', collapsed && 'sr-only')}>
              <p className="truncate text-sm font-medium">{name}</p>
              <p className="truncate text-xs text-muted-foreground">{user.username}</p>
            </div>
            <WithTooltip label="Sign out" side={collapsed ? 'right' : 'top'}>
              <Button
                variant="ghost"
                size="icon"
                className="text-muted-foreground hover:text-foreground"
                aria-label="Sign out"
                onClick={onSignOut}
                disabled={signingOut}
              >
                <LogOut className="size-[18px]" />
              </Button>
            </WithTooltip>
          </div>
        </div>
      </aside>
    </TooltipProvider>
  );
}

export function AppLayout() {
  const settings = useQuery(settingsQuery);
  const auth = useQuery(authQuery);
  const queryClient = useQueryClient();
  const mainRef = useRef<HTMLElement>(null);
  const signOut = useMutation({
    mutationFn: () => window.accessdesk.auth.logout(),
    onSuccess: () => queryClient.invalidateQueries(),
    onError: () => toast.error('Could not sign out. Try again.'),
  });

  if (settings.isPending || auth.isPending) return <ShellSkeleton />;
  if (settings.isError || auth.isError) {
    return (
      <div className="grid min-h-screen place-items-center p-6">
        <p role="alert" className="max-w-sm text-center text-sm text-destructive">
          The app could not read its local state. Restart AccessDesk.
        </p>
      </div>
    );
  }
  if (!settings.data) return <Navigate to="/setup" replace />;
  if (!auth.data.authenticated) return <Navigate to="/login" replace />;
  if (!hasAdminAccess(auth.data.roles, auth.data.adminRoles))
    return <Navigate to="/no-access" replace />;

  const user = auth.data;
  return (
    <div className="flex h-screen">
      {/* A hash router owns location.hash, so move focus instead of using an #anchor. */}
      <a
        href="#main-content"
        onClick={(event) => {
          event.preventDefault();
          mainRef.current?.focus();
        }}
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-card focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:shadow-md focus:outline-none focus:ring-2 focus:ring-ring"
      >
        Skip to main content
      </a>
      <Sidebar
        user={user}
        allowed={(feature) => canAccess(user.roles, feature, user.adminRoles, user.superAdminRole)}
        onSignOut={() => signOut.mutate()}
        signingOut={signOut.isPending}
      />
      <main
        id="main-content"
        ref={mainRef}
        tabIndex={-1}
        className="flex-1 overflow-y-auto outline-none"
      >
        <div className="mx-auto w-full max-w-6xl px-8 pt-8 pb-12">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
