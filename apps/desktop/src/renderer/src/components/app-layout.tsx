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
import {
  createContext,
  Suspense,
  use,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Link, Navigate, Outlet, useMatch } from 'react-router';
import { BrandMark } from '@/components/brand';
import { PageSkeleton, ShellSkeleton } from '@/components/skeletons';
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

interface SidebarState {
  collapsed: boolean;
  toggle: () => void;
}

/** Lets the nav items and the collapse button read the sidebar's state without prop drilling. */
const SidebarContext = createContext<SidebarState | null>(null);

function useSidebar(): SidebarState {
  const state = use(SidebarContext);
  if (!state) throw new Error('useSidebar must be used inside <Sidebar>');
  return state;
}

function NavItemLink({ item }: { item: NavItem }) {
  const { collapsed } = useSidebar();
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
            <span className="rounded-full bg-inverse-on-surface/15 px-1.5 py-px text-label-small">
              Soon
            </span>
          )}
        </>
      }
    >
      <Link
        to={to}
        aria-current={isActive ? 'page' : undefined}
        // An M3 navigation drawer item: a 48px pill that is filled with the secondary container
        // while its screen is open. Hover and focus show the state layer.
        className={cn(
          'state-layer group flex h-12 cursor-pointer items-center gap-3 rounded-full px-4 text-label-large outline-none focus-visible:ring-2 focus-visible:ring-primary',
          collapsed && 'mx-auto size-12 justify-center px-0',
          // "Soon" is generated content: it reads as part of the link name in a browser but
          // stays out of the DOM text.
          soon &&
            !collapsed &&
            "after:ml-auto after:rounded-full after:bg-surface-container-highest after:px-2 after:py-0.5 after:text-label-small after:text-on-surface-variant after:content-['Soon']",
          isActive
            ? 'bg-secondary-container text-on-secondary-container'
            : 'text-on-surface-variant',
        )}
      >
        <Icon className="size-6 shrink-0" aria-hidden="true" />
        <span className={cn('truncate', collapsed && 'sr-only')}>{label}</span>
      </Link>
    </WithTooltip>
  );
}

function CollapseToggle() {
  const { collapsed, toggle } = useSidebar();
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
        className="text-on-surface-variant"
        aria-controls="sidebar"
        aria-expanded={!collapsed}
        aria-label={label}
        aria-keyshortcuts="Control+B"
        onClick={toggle}
      >
        <Icon className="size-6" />
      </Button>
    </WithTooltip>
  );
}

interface SidebarUser {
  displayName: string | null;
  username: string | null;
  roles: readonly string[];
  adminRoles: readonly string[];
  superAdminRole?: string;
}

function Sidebar({
  user,
  onSignOut,
  signingOut,
}: {
  user: SidebarUser;
  onSignOut: () => void;
  signingOut: boolean;
}) {
  const { roles, adminRoles, superAdminRole } = user;
  const allowed = useCallback(
    (feature: Feature) => canAccess(roles, feature, adminRoles, superAdminRole),
    [roles, adminRoles, superAdminRole],
  );
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

  const sidebar = useMemo(() => ({ collapsed, toggle }), [collapsed, toggle]);
  const groups = useMemo(
    () =>
      NAV_GROUPS.map((group) => ({
        ...group,
        items: group.items.filter((item) => allowed(item.feature)),
      })).filter((group) => group.items.length > 0),
    [allowed],
  );
  const name = user.displayName ?? user.username ?? '';

  return (
    <SidebarContext value={sidebar}>
      <TooltipProvider delayDuration={100}>
        <aside
          id="sidebar"
          className={cn(
            'flex shrink-0 flex-col bg-sidebar text-sidebar-foreground',
            collapsed ? 'w-20' : 'w-72',
          )}
        >
          <div
            className={cn(
              'flex shrink-0 items-center',
              collapsed ? 'flex-col gap-2 py-3' : 'h-20 gap-3 pr-3 pl-5',
            )}
          >
            <BrandMark />
            <div className={cn('min-w-0 flex-1', collapsed && 'sr-only')}>
              <span className="block text-title-medium">AccessDesk</span>
              <span className="block truncate text-body-small text-on-surface-variant">
                Identity admin
              </span>
            </div>
            <CollapseToggle />
          </div>

          <nav aria-label="Main" className="flex flex-1 flex-col gap-4 overflow-y-auto px-3 py-2">
            {groups.map((group, index) => (
              <div key={group.id} className="flex flex-col gap-1">
                {collapsed && index > 0 && (
                  <span aria-hidden="true" className="mx-auto mb-3 h-px w-6 bg-outline-variant" />
                )}
                <p
                  id={`nav-group-${group.id}`}
                  className={cn(
                    'px-4 pt-2 pb-1 text-title-small text-on-surface-variant',
                    collapsed && 'sr-only',
                  )}
                >
                  {group.label}
                </p>
                <ul aria-labelledby={`nav-group-${group.id}`} className="flex flex-col gap-0.5">
                  {group.items.map((item) => (
                    <li key={item.feature}>
                      <NavItemLink item={item} />
                    </li>
                  ))}
                </ul>
              </div>
            ))}

            {allowed(SETTINGS_ITEM.feature) && (
              <ul className="mt-auto border-t border-outline-variant pt-3">
                <li>
                  <NavItemLink item={SETTINGS_ITEM} />
                </li>
              </ul>
            )}
          </nav>

          <div
            className={cn(
              'flex flex-col gap-3 border-t border-outline-variant p-3',
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
                    {user.username && (
                      <span className="font-normal opacity-75">{user.username}</span>
                    )}
                  </span>
                }
              >
                <span className="flex">
                  <Avatar name={name} />
                </span>
              </WithTooltip>
              <div className={cn('min-w-0 flex-1', collapsed && 'sr-only')}>
                <p className="truncate text-label-large">{name}</p>
                <p className="truncate text-body-small text-on-surface-variant">{user.username}</p>
              </div>
              <WithTooltip label="Sign out" side={collapsed ? 'right' : 'top'}>
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-on-surface-variant"
                  aria-label="Sign out"
                  onClick={onSignOut}
                  disabled={signingOut}
                >
                  <LogOut className="size-6" />
                </Button>
              </WithTooltip>
            </div>
          </div>
        </aside>
      </TooltipProvider>
    </SidebarContext>
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
        <p role="alert" className="max-w-sm text-center text-body-medium text-error">
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
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-full focus:bg-primary focus:px-6 focus:py-2.5 focus:text-label-large focus:text-on-primary focus:shadow-elevation-2 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background"
      >
        Skip to main content
      </a>
      <Sidebar user={user} onSignOut={() => signOut.mutate()} signingOut={signOut.isPending} />
      <main
        id="main-content"
        ref={mainRef}
        tabIndex={-1}
        className="flex-1 overflow-y-auto outline-none"
      >
        <div className="mx-auto w-full max-w-6xl px-8 pt-8 pb-12">
          <Suspense fallback={<PageSkeleton />}>
            <Outlet />
          </Suspense>
        </div>
      </main>
    </div>
  );
}
