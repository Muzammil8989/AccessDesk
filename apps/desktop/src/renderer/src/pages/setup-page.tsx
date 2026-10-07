import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { SettingsForm } from '@/components/settings-form';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { settingsQuery } from '@/lib/session';

export function SetupPage() {
  const navigate = useNavigate();
  const settings = useQuery(settingsQuery);

  return (
    <div className="grid min-h-screen place-items-center p-6">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle className="text-xl">Welcome to AccessDesk</CardTitle>
          <CardDescription>
            Connect to your identity provider to get started. These are public settings only: no
            password or secret is stored in this app.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {settings.isPending ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : (
            <SettingsForm
              initial={settings.data ?? null}
              submitLabel="Save and continue"
              onSaved={() => void navigate('/login', { replace: true })}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
