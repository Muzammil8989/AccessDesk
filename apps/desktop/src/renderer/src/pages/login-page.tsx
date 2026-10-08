import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, Navigate } from 'react-router';
import { BrandMark } from '@/components/brand';
import { CenteredCardSkeleton } from '@/components/skeletons';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { authQuery, settingsQuery } from '@/lib/session';

export function LoginPage() {
  const queryClient = useQueryClient();
  const settings = useQuery(settingsQuery);
  const auth = useQuery(authQuery);

  const login = useMutation({
    mutationFn: () => window.accessdesk.auth.login(),
    onSuccess: (result) => {
      if (result.ok) void queryClient.invalidateQueries({ queryKey: authQuery.queryKey });
    },
  });

  if (settings.isPending || auth.isPending) return <CenteredCardSkeleton />;
  if (!settings.data) return <Navigate to="/setup" replace />;
  if (auth.data?.authenticated) return <Navigate to="/employees" replace />;

  const failure = login.data && !login.data.ok && !login.data.cancelled ? login.data.message : null;

  return (
    <div className="grid min-h-screen place-items-center p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <BrandMark className="mb-2 size-10" />
          <CardTitle as="h1" className="text-xl">
            Sign in to AccessDesk
          </CardTitle>
          <CardDescription>
            You will sign in with your company account in your web browser.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {login.isPending ? (
            <>
              <p role="status" className="text-sm text-muted-foreground">
                Waiting for you to finish signing in in your browser…
              </p>
              <Button variant="outline" onClick={() => void window.accessdesk.auth.cancelLogin()}>
                Cancel
              </Button>
            </>
          ) : (
            <Button onClick={() => login.mutate()}>Sign in</Button>
          )}
          {failure && (
            <p role="alert" className="text-sm text-destructive">
              {failure}
            </p>
          )}
          {login.isError && (
            <p role="alert" className="text-sm text-destructive">
              Sign-in failed unexpectedly. Try again.
            </p>
          )}
          <Link to="/setup" className="text-sm text-muted-foreground underline underline-offset-4">
            Change connection settings
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
