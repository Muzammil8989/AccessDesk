import {
  canAccess,
  templateViolation,
  type OnboardEmployee,
  type OnboardResult,
  type OnboardingOptions,
  type RetryOnboarding,
  type Template,
} from '@accessdesk/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router';
import { OnboardForm, type SubmitFailure, type TemplatesState } from '@/components/onboard-form';
import { OnboardResultView, type OnboardSummary } from '@/components/onboard-result';
import { PageHeader } from '@/components/page-header';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ApiRequestError } from '@/lib/api';
import { createOnboarding, onboardingOptionsQuery, retryOnboarding } from '@/lib/onboarding-api';
import { authQuery } from '@/lib/session';
import { templatesQuery } from '@/lib/templates-api';

interface OnboardSession {
  result: OnboardResult;
  password: string | null;
  summary: OnboardSummary;
  retryInput: RetryOnboarding;
}

const NETWORK_FAILURE =
  'Could not confirm the result. Check the Employees list before trying again, because the account may have been created.';
const SERVER_FAILURE = 'The request failed. Check the Employees list before trying again.';
const RATE_LIMITED = 'Too many requests. Wait a minute and try again.';
const UNKNOWN_FAILURE = 'Something went wrong. Try again.';

function describeFailure(error: unknown): SubmitFailure {
  if (!(error instanceof ApiRequestError)) return { message: UNKNOWN_FAILURE };
  if (error.code === 'username_exists') return { field: 'username', message: error.message };
  if (error.code === 'email_exists') return { field: 'email', message: error.message };
  if (error.status === 429) return { message: RATE_LIMITED };
  if (error.status === 0) return { message: NETWORK_FAILURE };
  if (error.status >= 500) return { message: SERVER_FAILURE };
  return { message: error.message };
}

function summaryOf(
  values: OnboardEmployee,
  options: OnboardingOptions,
  templates: readonly Template[],
): OnboardSummary {
  const department = options.departments.find((item) => item.id === values.departmentGroupId);
  const template = templates.find((item) => item.id === values.templateId);
  return {
    name: `${values.firstName} ${values.lastName}`,
    username: values.username,
    email: values.email,
    departmentName: department?.name ?? values.departmentGroupId,
    role: values.role,
    ...(template && { templateName: template.name }),
  };
}

export function OnboardPage() {
  const queryClient = useQueryClient();
  const auth = useQuery(authQuery);
  const options = useQuery(onboardingOptionsQuery);
  const templates = useQuery(templatesQuery);
  const [session, setSession] = useState<OnboardSession | null>(null);
  const [retryError, setRetryError] = useState<string | null>(null);

  const create = useMutation({ mutationFn: createOnboarding, retry: false, gcTime: 0 });
  const retry = useMutation({ mutationFn: retryOnboarding, retry: false, gcTime: 0 });

  const signOutOnExpiredSession = (error: unknown) => {
    if (error instanceof ApiRequestError && error.status === 401) {
      void queryClient.invalidateQueries({ queryKey: authQuery.queryKey });
    }
  };

  async function submit(values: OnboardEmployee): Promise<SubmitFailure | null> {
    if (!options.data) return { message: UNKNOWN_FAILURE };
    try {
      const result = await create.mutateAsync(values);
      create.reset();
      setRetryError(null);
      setSession({
        result,
        password: result.temporaryPassword ?? null,
        summary: summaryOf(values, options.data, templates.data?.items ?? []),
        retryInput: {
          departmentGroupId: values.departmentGroupId,
          role: values.role,
          ...(values.templateId && { templateId: values.templateId }),
        },
      });
      return null;
    } catch (error) {
      signOutOnExpiredSession(error);
      return describeFailure(error);
    }
  }

  async function retryRemaining() {
    if (!session) return;
    setRetryError(null);
    try {
      const result = await retry.mutateAsync({
        subjectId: session.result.subjectId,
        input: session.retryInput,
      });
      retry.reset();
      setSession({ ...session, result });
    } catch (error) {
      signOutOnExpiredSession(error);
      setRetryError(describeFailure(error).message);
    }
  }

  function startOver() {
    create.reset();
    retry.reset();
    setRetryError(null);
    setSession(null);
  }

  const canAssignAdmin = canAccess(
    auth.data?.roles ?? [],
    'onboard-assign-admin',
    auth.data?.adminRoles ?? [],
    auth.data?.superAdminRole,
  );

  const templatesState: TemplatesState = templates.isPending
    ? 'loading'
    : templates.isError
      ? 'error'
      : 'ready';
  const templateBlockedReason = (template: Template) =>
    templateViolation(template, auth.data?.roles ?? [], {
      adminRoles: auth.data?.adminRoles ?? [],
      superAdminRole: auth.data?.superAdminRole ?? '',
    });

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <PageHeader
        title="Onboard"
        description="Add a new person to the company."
        actions={
          <Button asChild variant="outline">
            <Link to="/onboard/checklists">Open checklists</Link>
          </Button>
        }
      />

      {session ? (
        <OnboardResultView
          result={session.result}
          summary={session.summary}
          password={session.password}
          retrying={retry.isPending}
          retryError={retryError}
          onRetry={() => void retryRemaining()}
          onReset={startOver}
        />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>New employee</CardTitle>
            <CardDescription>
              Creates the account, adds it to a department and assigns a role. You get a temporary
              password to hand over.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {options.isPending && (
              <div role="status" aria-label="Loading the form" className="flex flex-col gap-4">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            )}
            {options.isError && (
              <Alert variant="destructive" role="alert">
                <AlertDescription className="mt-0 text-foreground">
                  {options.error instanceof ApiRequestError
                    ? options.error.message
                    : 'Could not load the departments.'}
                </AlertDescription>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  onClick={() => void options.refetch()}
                >
                  Try again
                </Button>
              </Alert>
            )}
            {options.data && options.data.departments.length === 0 && (
              <Alert variant="info" role="status">
                <AlertDescription className="mt-0 text-foreground">
                  No departments were found in the identity provider. Create a top-level group there
                  first, then reload this page.
                </AlertDescription>
              </Alert>
            )}
            {options.data && options.data.departments.length > 0 && (
              <OnboardForm
                options={options.data}
                canAssignAdmin={canAssignAdmin}
                templates={templates.data?.items ?? []}
                templatesState={templatesState}
                templateBlockedReason={templateBlockedReason}
                onSubmit={submit}
              />
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
