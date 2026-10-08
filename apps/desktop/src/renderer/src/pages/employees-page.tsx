import { employeeListSchema, type Employee } from '@accessdesk/shared';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  CircleSlash,
  Search,
  SearchX,
  Users,
} from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { PageHeader } from '@/components/page-header';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { ApiRequestError, apiGet } from '@/lib/api';
import { authQuery } from '@/lib/session';
import { cn } from '@/lib/utils';

const PAGE_SIZE = 20;
const COLUMNS = 4;

function nameOf(employee: Employee): string {
  return [employee.firstName, employee.lastName].filter(Boolean).join(' ');
}

function EmptyState({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
      <span
        aria-hidden="true"
        className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground"
      >
        {icon}
      </span>
      {children}
    </div>
  );
}

export function EmployeesPage() {
  const queryClient = useQueryClient();
  const [searchText, setSearchText] = useState('');
  const [page, setPage] = useState(0);
  const search = useDebouncedValue(searchText.trim(), 300);

  const employees = useQuery({
    queryKey: ['employees', search, page],
    queryFn: () =>
      apiGet('/employees', employeeListSchema, {
        ...(search ? { search } : {}),
        first: page * PAGE_SIZE,
        max: PAGE_SIZE,
      }),
    placeholderData: keepPreviousData,
    retry: (count, error) => error instanceof ApiRequestError && error.retryable && count < 2,
  });

  const status = employees.error instanceof ApiRequestError ? employees.error.status : null;
  useEffect(() => {
    if (status === 401) void queryClient.invalidateQueries({ queryKey: authQuery.queryKey });
  }, [status, queryClient]);

  const data = employees.data;
  const total = data?.total ?? 0;
  const from = total === 0 ? 0 : page * PAGE_SIZE + 1;
  const to = Math.min((page + 1) * PAGE_SIZE, total);
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const refreshing = employees.isFetching && !employees.isPending;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Employees"
        description="Everyone in your identity provider."
        actions={
          <div className="relative w-full min-w-64 sm:w-80">
            <Search
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              type="search"
              aria-label="Search employees"
              placeholder="Search by name, username or email"
              className="pl-9"
              value={searchText}
              onChange={(event) => {
                setSearchText(event.target.value);
                setPage(0);
              }}
            />
          </div>
        }
      />

      {employees.isError ? (
        <Alert variant="destructive" role="alert">
          <AlertTitle>Could not load employees</AlertTitle>
          <AlertDescription>
            <p>{employees.error.message}</p>
            {status === 403 && (
              <p className="mt-1">
                Open{' '}
                <Link to="/settings" className="text-foreground underline underline-offset-4">
                  Settings
                </Link>{' '}
                to see which roles your sign-in has.
              </p>
            )}
          </AlertDescription>
          <Button
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={() => void employees.refetch()}
          >
            Try again
          </Button>
        </Alert>
      ) : (
        <div
          className={cn(
            'overflow-hidden rounded-xl border bg-card shadow-xs transition-opacity duration-150 ease-standard',
            refreshing && 'opacity-70',
          )}
          aria-busy={employees.isFetching}
        >
          <Table containerClassName="max-h-[calc(100vh-19rem)] min-h-48 overflow-auto">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Name</TableHead>
                <TableHead>Username</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {employees.isPending &&
                Array.from({ length: 6 }, (_, i) => (
                  <TableRow key={i} className="hover:bg-transparent">
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Skeleton className="size-8 rounded-full" />
                        <Skeleton className="h-4 w-28" />
                      </div>
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-24" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-40" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-5 w-16 rounded-full" />
                    </TableCell>
                  </TableRow>
                ))}
              {data?.items.map((employee) => (
                <TableRow key={employee.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar name={nameOf(employee) || employee.username} />
                      <span className="font-medium">{nameOf(employee) || '—'}</span>
                    </div>
                  </TableCell>
                  <TableCell>{employee.username}</TableCell>
                  <TableCell className="break-all text-muted-foreground">
                    {employee.email ?? '—'}
                  </TableCell>
                  <TableCell>
                    <Badge variant={employee.enabled ? 'success' : 'secondary'}>
                      {employee.enabled ? (
                        <CircleCheck aria-hidden="true" />
                      ) : (
                        <CircleSlash aria-hidden="true" />
                      )}
                      {employee.enabled ? 'Active' : 'Disabled'}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
              {data && data.items.length === 0 && (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={COLUMNS} className="p-0">
                    {search ? (
                      <EmptyState icon={<SearchX className="size-5" />}>
                        <p className="font-medium">No employees match “{search}”.</p>
                        <p className="text-sm text-muted-foreground">
                          Try a different name, username or email.
                        </p>
                        <Button
                          variant="outline"
                          size="sm"
                          className="mt-2"
                          onClick={() => {
                            setSearchText('');
                            setPage(0);
                          }}
                        >
                          Clear search
                        </Button>
                      </EmptyState>
                    ) : (
                      <EmptyState icon={<Users className="size-5" />}>
                        <p className="font-medium">No employees found.</p>
                        <p className="text-sm text-muted-foreground">
                          People you onboard will show up here.
                        </p>
                      </EmptyState>
                    )}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3 text-sm text-muted-foreground">
            <span role="status">{total > 0 ? `Showing ${from}–${to} of ${total}` : ''}</span>
            <div className="flex items-center gap-3">
              {pageCount > 1 && (
                <span className="tabular-nums">
                  Page {page + 1} of {pageCount}
                </span>
              )}
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => p - 1)}
                  disabled={page === 0}
                >
                  <ChevronLeft /> Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => p + 1)}
                  disabled={to >= total}
                >
                  Next <ChevronRight />
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
