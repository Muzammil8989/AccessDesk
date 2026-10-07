import { useQuery } from '@tanstack/react-query';
import { SettingsForm } from '@/components/settings-form';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { authQuery, settingsQuery } from '@/lib/session';

export function SettingsPage() {
  const settings = useQuery(settingsQuery);
  const auth = useQuery(authQuery);
  const roles = [...(auth.data?.roles ?? [])].sort();
  const adminRoles = auth.data?.adminRoles ?? [];
  const isAdminRole = (role: string) => adminRoles.includes(role);

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <h1 className="text-2xl font-semibold">Settings</h1>

      <Card>
        <CardHeader>
          <CardTitle>Identity provider connection</CardTitle>
          <CardDescription>Changing the issuer URL or the client signs you out.</CardDescription>
        </CardHeader>
        <CardContent>
          {settings.data && <SettingsForm initial={settings.data} submitLabel="Save settings" />}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
          <CardDescription>The admin you are signed in as.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm">
          <p>
            <span className="text-muted-foreground">User: </span>
            {auth.data?.displayName ?? auth.data?.username}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-muted-foreground">Roles in your token: </span>
            {roles.length === 0 && <span className="text-muted-foreground">none</span>}
            {roles.map((role) => (
              <Badge key={role} variant={isAdminRole(role) ? 'success' : 'secondary'}>
                {role}
              </Badge>
            ))}
          </div>
          {auth.data && !auth.data.persistent && (
            <p role="status" className="text-muted-foreground">
              Your operating system's secure storage is not available, so your sign-in is kept in
              memory only and you will need to sign in again after restarting.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
