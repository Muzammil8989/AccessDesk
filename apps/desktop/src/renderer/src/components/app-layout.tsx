import { canAccess, hasAdminAccess, type Feature } from '@accessdesk/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  LogOut,
  ScrollText,
  Settings,
  ShieldCheck,
  UserMinus,
  UserPlus,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { Navigate, NavLink, Outlet } from 'react-router';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { authQuery, settingsQuery } from '@/lib/session';

const NAV_ITEMS: { feature: Feature; label: string; icon: LucideIcon }[] = [
  { feature: 'employees', label: 'Employees', icon: Users },
  { feature: 'onboard', label: 'Onboard', icon: UserPlus },
  { feature: 'offboard', label: 'Offboard', icon: UserMinus },
  { feature: 'access-review', label: 'Access Review', icon: ShieldCheck },
  { feature: 'audit-log', label: 'Audit Log', icon: ScrollText },
  { feature: 'settings', label: 'Settings', icon: Settings },
];

export function AppLayout() {
  const settings = useQuery(settingsQuery);
  const auth = useQuery(authQuery);
  const queryClient = useQueryClient();
  const signOut = useMutation({
    mutationFn: () => window.accessdesk.auth.logout(),
    onSuccess: () => queryClient.invalidateQueries(),
  });

  if (settings.isPending || auth.isPending) {
    return <p className="p-8 text-sm text-muted-foreground">Loading…</p>;
  }
  if (settings.isError || auth.isError) {
    return (
      <p role="alert" className="p-8 text-sm text-destructive">
        The app could not read its local state. Restart AccessDesk.
      </p>
    );
  }
  if (!settings.data) return <Navigate to="/setup" replace />;
  if (!auth.data.authenticated) return <Navigate to="/login" replace />;
  if (!hasAdminAccess(auth.data.roles)) return <Navigate to="/no-access" replace />;

  const user = auth.data;
  const navItems = NAV_ITEMS.filter((item) => canAccess(user.roles, item.feature));
  return (
    <div className="flex h-screen">
      <aside className="flex w-60 shrink-0 flex-col border-r bg-sidebar">
        <div className="px-5 py-5 text-lg font-semibold">AccessDesk</div>
        <nav aria-label="Main" className="flex flex-1 flex-col gap-1 px-3">
          {navItems.map(({ feature, label, icon: Icon }) => (
            <NavLink
              key={feature}
              to={`/${feature}`}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50',
                  isActive
                    ? 'bg-accent text-accent-foreground'
                    : 'text-muted-foreground hover:bg-accent/60 hover:text-accent-foreground',
                )
              }
            >
              <Icon className="size-4" aria-hidden="true" />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="flex items-center gap-2 border-t p-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{user.displayName ?? user.username}</p>
            <p className="truncate text-xs text-muted-foreground">{user.username}</p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Sign out"
            title="Sign out"
            onClick={() => signOut.mutate()}
            disabled={signOut.isPending}
          >
            <LogOut />
          </Button>
        </div>
      </aside>
      <main className="flex-1 overflow-y-auto p-8">
        <Outlet />
      </main>
    </div>
  );
}
