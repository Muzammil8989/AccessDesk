import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { BrandMark } from '@/components/brand';
import { SettingsForm } from '@/components/settings-form';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { settingsQuery } from '@/lib/session';

export function SetupPage() {
  const navigate = useNavigate();
  const settings = useQuery(settingsQuery);

  return (
    <div className="grid min-h-screen place-items-center p-6">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <BrandMark className="mb-2 size-10" />
          <CardTitle as="h1" className="text-xl">
            Welcome to AccessDesk
          </CardTitle>
          <CardDescription>
            Connect to your identity provider to get started. These are public settings only: no
            password or secret is stored in this app.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {settings.isPending ? (
            <div role="status" aria-label="Loading settings" className="flex flex-col gap-4">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
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
