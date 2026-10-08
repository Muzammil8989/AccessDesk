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
import { useRef, useState } from 'react';
import { Navigate, NavLink, Outlet } from 'react-router';
import { BrandMark } from '@/components/brand';
import { ShellSkeleton } from '@/components/skeletons';
import { ThemeToggle } from '@/components/theme-toggle';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
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

function NavItemLink({ item, collapsed }: { item: NavItem; collapsed: boolean }) {
  const { feature, label, icon: Icon, soon } = item;
  return (
    <NavLink
      to={`/${feature}`}
      title={collapsed ? (soon ? `${label} (soon)` : label) : undefined}
      className={({ isActive }) =>
        cn(
          'relative flex h-10 items-center gap-3 rounded-md px-3 text-sm font-medium outline-none transition-colors duration-150 ease-standard focus-visible:ring-2 focus-visible:ring-ring',
          collapsed && 'justify-center px-0',
          // "Soon" is generated content: it reads as part of the link name in a browser but
          // stays out of the DOM text.
          soon &&
            !collapsed &&
            "after:ml-auto after:rounded-full after:bg-muted after:px-2 after:py-0.5 after:text-xs after:font-medium after:text-muted-foreground after:content-['Soon']",
          isActive
            ? 'bg-sidebar-accent text-sidebar-accent-foreground'
            : 'text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground',
        )
      }
    >
      {({ isActive }) => (
        <>
          {isActive && (
            <span
              aria-hidden="true"
              className="absolute top-2 bottom-2 left-0 w-0.5 rounded-full bg-primary"
            />
          )}
          <Icon className={cn('size-4 shrink-0', isActive && 'text-primary')} aria-hidden="true" />
          <span className={cn(collapsed && 'sr-only')}>{label}</span>
        </>
      )}
    </NavLink>
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
  const [manual, setManual] = useState<boolean | null>(null);
  const collapsed = manual ?? compact;

  const groups = NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => allowed(item.feature)),
  })).filter((group) => group.items.length > 0);
  const name = user.displayName ?? user.username ?? '';

  return (
    <aside
      id="sidebar"
      className={cn(
        'flex shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground',
        collapsed ? 'w-16' : 'w-60',
      )}
    >
      <div className={cn('flex h-16 items-center gap-3 px-4', collapsed && 'justify-center px-0')}>
        <BrandMark />
        <span className={cn('text-lg font-semibold tracking-tight', collapsed && 'sr-only')}>
          AccessDesk
        </span>
      </div>

      <nav aria-label="Main" className="flex flex-1 flex-col gap-4 overflow-y-auto px-3 py-2">
        {groups.map((group) => (
          <div
            key={group.id}
            className={cn(
              'flex flex-col gap-1',
              collapsed && 'border-t pt-3 first:border-t-0 first:pt-0',
            )}
          >
            <p
              id={`nav-group-${group.id}`}
              className={cn(
                'px-3 pb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase',
                collapsed && 'sr-only',
              )}
            >
              {group.label}
            </p>
            <ul aria-labelledby={`nav-group-${group.id}`} className="flex flex-col gap-1">
              {group.items.map((item) => (
                <li key={item.feature}>
                  <NavItemLink item={item} collapsed={collapsed} />
                </li>
              ))}
            </ul>
          </div>
        ))}

        {allowed(SETTINGS_ITEM.feature) && (
          <ul className="mt-auto border-t pt-3">
            <li>
              <NavItemLink item={SETTINGS_ITEM} collapsed={collapsed} />
            </li>
          </ul>
        )}
      </nav>

      <div className="flex flex-col gap-3 border-t border-sidebar-border p-3">
        <ThemeToggle compact={collapsed} className={cn(collapsed && 'mx-auto')} />
        <Button
          variant="ghost"
          size={collapsed ? 'icon' : 'sm'}
          className={cn(collapsed ? 'mx-auto' : 'justify-start text-muted-foreground')}
          aria-controls="sidebar"
          aria-expanded={!collapsed}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          onClick={() => setManual(!collapsed)}
        >
          {collapsed ? (
            <PanelLeftOpen />
          ) : (
            <>
              <PanelLeftClose /> Collapse
            </>
          )}
        </Button>
        <div className={cn('flex items-center gap-2', collapsed && 'flex-col')}>
          <Avatar name={name} />
          <div className={cn('min-w-0 flex-1', collapsed && 'sr-only')}>
            <p className="truncate text-sm font-medium">{name}</p>
            <p className="truncate text-xs text-muted-foreground">{user.username}</p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Sign out"
            title="Sign out"
            onClick={onSignOut}
            disabled={signingOut}
          >
            <LogOut />
          </Button>
        </div>
      </div>
    </aside>
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
        <div className="mx-auto w-full max-w-6xl p-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
