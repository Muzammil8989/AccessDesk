import { employeeListSchema, type Employee } from '@accessdesk/shared';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
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

const PAGE_SIZE = 20;

function fullName(employee: Employee): string {
  return [employee.firstName, employee.lastName].filter(Boolean).join(' ') || '—';
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

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">Employees</h1>
        <div className="relative w-full max-w-xs">
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
      </div>

      {employees.isError ? (
        <div role="alert" className="rounded-lg border border-destructive/40 p-4 text-sm">
          <p className="font-medium text-destructive">Could not load employees</p>
          <p className="mt-1 text-muted-foreground">{employees.error.message}</p>
          {status === 403 && (
            <p className="mt-1 text-muted-foreground">
              Open{' '}
              <Link to="/settings" className="underline underline-offset-4">
                Settings
              </Link>{' '}
              to see which roles your sign-in has.
            </p>
          )}
          <Button
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={() => void employees.refetch()}
          >
            Try again
          </Button>
        </div>
      ) : (
        <>
          <div className="rounded-lg border" aria-busy={employees.isFetching} aria-live="polite">
            <Table>
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
                    <TableRow key={i}>
                      <TableCell colSpan={4}>
                        <Skeleton className="h-5 w-full" />
                      </TableCell>
                    </TableRow>
                  ))}
                {data?.items.map((employee) => (
                  <TableRow key={employee.id}>
                    <TableCell className="font-medium">{fullName(employee)}</TableCell>
                    <TableCell>{employee.username}</TableCell>
                    <TableCell className="text-muted-foreground">{employee.email ?? '—'}</TableCell>
                    <TableCell>
                      <Badge variant={employee.enabled ? 'success' : 'secondary'}>
                        {employee.enabled ? 'Active' : 'Disabled'}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
                {data && data.items.length === 0 && (
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={4} className="py-10 text-center text-muted-foreground">
                      {search ? `No employees match “${search}”.` : 'No employees found.'}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>{total > 0 ? `Showing ${from}–${to} of ${total}` : ''}</span>
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
        </>
      )}
    </div>
  );
}
