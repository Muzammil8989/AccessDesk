import { employeeIdParamsSchema, type EmployeeDetail } from '@accessdesk/shared';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, BadgeCheck, CircleAlert, UserX } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link, useLocation, useParams } from 'react-router';
import { EmployeeStatusBadge } from '@/components/employee-status-badge';
import { EmptyState } from '@/components/empty-state';
import { PageHeader } from '@/components/page-header';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useReauthOn401 } from '@/hooks/use-reauth-on-401';
import { ApiRequestError } from '@/lib/api';
import { employeeDetailQuery } from '@/lib/employees-api';
import { formatDate } from '@/lib/format';

/**
 * The Employees list puts its search, filters and page in the URL and hands them over here, so
 * "All employees" lands back on the same list. A person who opened this address directly has none.
 */
function listLink(state: unknown): string {
  const search = (state as { listSearch?: unknown } | null)?.listSearch;
  return typeof search === 'string' && search !== '' ? `/employees?${search}` : '/employees';
}

function BackButton({ to }: { to: string }) {
  return (
    <Button asChild variant="outline">
      <Link to={to}>
        <ArrowLeft /> All employees
      </Link>
    </Button>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-label-large text-on-surface-variant">{label}</dt>
      <dd className="min-w-0 text-body-large break-words">{children}</dd>
    </div>
  );
}

function Profile({ employee }: { employee: EmployeeDetail }) {
  const name = [employee.firstName, employee.lastName].filter(Boolean).join(' ');
  return (
    <Card>
      <CardHeader>
        <CardTitle>Profile</CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="grid gap-x-6 gap-y-5 sm:grid-cols-2">
          <Fact label="Name">{name || '—'}</Fact>
          <Fact label="Username">{employee.username}</Fact>
          <Fact label="Email">
            {employee.email ? (
              <span className="flex flex-wrap items-center gap-2">
                <span className="break-all">{employee.email}</span>
                {employee.emailVerified ? (
                  <Badge variant="secondary">
                    <BadgeCheck aria-hidden="true" /> Verified
                  </Badge>
                ) : (
                  <Badge variant="warning">
                    <CircleAlert aria-hidden="true" /> Not verified
                  </Badge>
                )}
              </span>
            ) : (
              '—'
            )}
          </Fact>
          <Fact label="Status">
            <EmployeeStatusBadge enabled={employee.enabled} />
          </Fact>
          <Fact label="Account created">
            {employee.createdAt ? formatDate(employee.createdAt) : '—'}
          </Fact>
        </dl>
      </CardContent>
    </Card>
  );
}

function Groups({ employee }: { employee: EmployeeDetail }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Groups</CardTitle>
        <CardDescription>
          The groups they were added to directly. A subgroup shows with its full path.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {employee.groups.length === 0 ? (
          <p className="text-body-large text-on-surface-variant">Not in any group.</p>
        ) : (
          <ul aria-label="Groups" className="flex flex-col gap-2">
            {employee.groups.map((group) => (
              <li key={group.id} className="text-body-large break-all">
                {group.path}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function Roles({ employee }: { employee: EmployeeDetail }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Roles</CardTitle>
        <CardDescription>
          The roles they hold directly. Roles that come through a group or through another role are
          not shown, and neither are the identity provider&apos;s own roles.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {employee.roles.length === 0 ? (
          <p className="text-body-large text-on-surface-variant">No roles assigned directly.</p>
        ) : (
          <ul aria-label="Roles" className="flex flex-col gap-3">
            {employee.roles.map((role) => (
              <li key={role.name}>
                <p className="text-body-large break-all">{role.name}</p>
                {role.description && (
                  <p className="text-body-medium text-on-surface-variant">{role.description}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function Loading() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-label="Loading the employee">
      <Skeleton className="h-48 w-full rounded-md" />
      <Skeleton className="h-28 w-full rounded-md" />
      <Skeleton className="h-28 w-full rounded-md" />
    </div>
  );
}

export function EmployeeDetailPage() {
  const { id = '' } = useParams<{ id: string }>();
  const location = useLocation();
  const back = listLink(location.state);

  // The desktop's read allowlist only lets a UUID through, so anything else is "not found" here
  // rather than a request that is refused.
  const validId = employeeIdParamsSchema.safeParse({ id }).success;
  const query = useQuery({ ...employeeDetailQuery(id), enabled: validId });
  useReauthOn401(query.error);

  const employee = query.data;
  const status = query.error instanceof ApiRequestError ? query.error.status : null;

  if (!validId || status === 404) {
    return (
      <div className="flex max-w-3xl flex-col gap-6">
        <PageHeader focusOnMount title="Employee not found" actions={<BackButton to={back} />} />
        <EmptyState icon={UserX}>
          <p className="text-title-medium">We could not find that person.</p>
          <p className="text-body-medium text-on-surface-variant">
            They may have been removed from the identity provider.
          </p>
        </EmptyState>
      </div>
    );
  }

  const name = employee
    ? [employee.firstName, employee.lastName].filter(Boolean).join(' ') || employee.username
    : 'Employee';

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <PageHeader focusOnMount title={name} actions={<BackButton to={back} />} />
      {query.isError ? (
        <Alert variant="destructive" role="alert">
          <AlertTitle>Could not load this employee</AlertTitle>
          <AlertDescription>
            <p>{query.error.message}</p>
          </AlertDescription>
          <div className="mt-3">
            <Button variant="outline" size="sm" onClick={() => void query.refetch()}>
              Try again
            </Button>
          </div>
        </Alert>
      ) : employee ? (
        <>
          <Profile employee={employee} />
          <Groups employee={employee} />
          <Roles employee={employee} />
        </>
      ) : (
        <Loading />
      )}
    </div>
  );
}
