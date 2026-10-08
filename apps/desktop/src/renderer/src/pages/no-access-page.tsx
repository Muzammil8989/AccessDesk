import { hasAdminAccess } from '@accessdesk/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { LogOut, ShieldAlert } from 'lucide-react';
import { Link, Navigate } from 'react-router';
import { CenteredCardSkeleton } from '@/components/skeletons';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { authQuery, settingsQuery } from '@/lib/session';
import { toast } from '@/lib/toast';

export function NoAccessPage() {
  const queryClient = useQueryClient();
  const settings = useQuery(settingsQuery);
  const auth = useQuery(authQuery);
  const signOut = useMutation({
    mutationFn: () => window.accessdesk.auth.logout(),
    onSuccess: () => queryClient.invalidateQueries(),
    onError: () => toast.error('Could not sign out. Try again.'),
  });

  if (settings.isPending || auth.isPending) return <CenteredCardSkeleton />;
  if (!settings.data) return <Navigate to="/setup" replace />;
  if (!auth.data?.authenticated) return <Navigate to="/login" replace />;
  if (hasAdminAccess(auth.data.roles, auth.data.adminRoles))
    return <Navigate to="/employees" replace />;

  const user = auth.data;
  const roles = [...user.roles].sort();

  return (
    <div className="grid min-h-screen place-items-center p-6">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <div className="mb-2 flex size-10 items-center justify-center rounded-full bg-destructive/15 text-destructive">
            <ShieldAlert className="size-5" aria-hidden="true" />
          </div>
          <CardTitle as="h1" className="text-xl">
            You don't have access to AccessDesk
          </CardTitle>
          <CardDescription>
            You are signed in as <strong>{user.displayName ?? user.username}</strong>, but this
            account has no AccessDesk role. Ask an administrator of your identity provider to give
            you the role{user.adminRoles.length === 1 ? '' : 's'}{' '}
            {user.adminRoles.map((role, index) => (
              <span key={role}>
                {index > 0 && ' or '}
                <strong>{role}</strong>
              </span>
            ))}
            .
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-muted-foreground">Roles in your sign-in: </span>
            {roles.length === 0 && <span className="text-muted-foreground">none</span>}
            {roles.map((role) => (
              <Badge key={role} variant="secondary">
                {role}
              </Badge>
            ))}
          </div>

          <details className="rounded-lg border p-3">
            <summary className="cursor-pointer font-medium">
              Role assigned but still no access?
            </summary>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
              <li>The role must have exactly that name.</li>
              <li>It can be assigned to the user, or to a group or composite role they have.</li>
              <li>The client's scopes must let roles into the access token.</li>
              <li>After any change, sign out and sign in again so the token is reissued.</li>
            </ul>
          </details>

          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={() => signOut.mutate()} disabled={signOut.isPending}>
              <LogOut /> Sign out
            </Button>
            <Link
              to="/setup"
              className="text-sm text-muted-foreground underline underline-offset-4"
            >
              Change connection settings
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
