import type { ChecklistList } from '@accessdesk/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, CircleCheck, ClipboardCheck } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { PageHeader } from '@/components/page-header';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ApiRequestError } from '@/lib/api';
import { CHECKLIST_PAGE_SIZE, checklistListQuery } from '@/lib/checklists-api';
import { formatDay } from '@/lib/format';
import { authQuery } from '@/lib/session';
import { cn } from '@/lib/utils';

type Filter = 'open' | 'done';

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'open', label: 'Open' },
  { value: 'done', label: 'Done' },
];

const taskCount = (count: number) => `${count} ${count === 1 ? 'task' : 'tasks'}`;

function nameOf(item: ChecklistList['items'][number]): string {
  return item.person?.displayName ?? 'Unknown person';
}

export function ChecklistsPage() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<Filter>('open');
  const [page, setPage] = useState(0);
  const checklists = useQuery(checklistListQuery(filter, page));

  const status = checklists.error instanceof ApiRequestError ? checklists.error.status : null;
  useEffect(() => {
    if (status === 401) void queryClient.invalidateQueries({ queryKey: authQuery.queryKey });
  }, [status, queryClient]);

  const data = checklists.data;
  const total = data?.total ?? 0;
  const from = total === 0 ? 0 : page * CHECKLIST_PAGE_SIZE + 1;
  const to = Math.min((page + 1) * CHECKLIST_PAGE_SIZE, total);
  const pageCount = Math.max(1, Math.ceil(total / CHECKLIST_PAGE_SIZE));
  const refreshing = checklists.isFetching && !checklists.isPending;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        focusOnMount
        title="Onboarding checklists"
        description="The tasks, manager and start date for each new employee. Start dates are for information only: accounts are enabled when you onboard."
        actions={
          <Button asChild variant="outline">
            <Link to="/onboard">Back to Onboard</Link>
          </Button>
        }
      />

      <fieldset className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <legend className="mb-2 text-sm font-medium">Show</legend>
        {FILTERS.map((option) => (
          <label
            key={option.value}
            className="flex min-h-10 cursor-pointer items-center gap-2 text-sm"
          >
            <input
              type="radio"
              name="checklist-filter"
              value={option.value}
              checked={filter === option.value}
              onChange={() => {
                setFilter(option.value);
                setPage(0);
              }}
              className="size-4 cursor-pointer accent-primary focus-visible:ring-2 focus-visible:ring-ring"
            />
            {option.label}
          </label>
        ))}
      </fieldset>

      {checklists.isError ? (
        <Alert variant="destructive" role="alert">
          <AlertTitle>Could not load the checklists</AlertTitle>
          <AlertDescription>
            <p>{checklists.error.message}</p>
          </AlertDescription>
          <Button
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={() => void checklists.refetch()}
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
          aria-busy={checklists.isFetching}
        >
          <Table containerClassName="max-h-[calc(100vh-22rem)] min-h-48 overflow-auto">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Employee</TableHead>
                <TableHead>Manager</TableHead>
                <TableHead>Start date</TableHead>
                <TableHead>Progress</TableHead>
                <TableHead>
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {checklists.isPending &&
                Array.from({ length: 4 }, (_, i) => (
                  <TableRow key={i} className="hover:bg-transparent">
                    <TableCell>
                      <Skeleton className="h-4 w-32" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-24" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-24" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-20" />
                    </TableCell>
                    <TableCell />
                  </TableRow>
                ))}
              {data?.items.map((item) => (
                <TableRow key={item.subjectId}>
                  <TableCell>
                    <div className="font-medium">{nameOf(item)}</div>
                    <div className="text-xs text-muted-foreground">
                      {item.person ? item.person.username : 'Not found in the identity provider'}
                    </div>
                  </TableCell>
                  <TableCell>
                    {item.manager ? (item.manager.person?.displayName ?? 'Unknown person') : '—'}
                  </TableCell>
                  <TableCell>{item.startDate ? formatDay(item.startDate) : '—'}</TableCell>
                  <TableCell>
                    {item.totalCount === 0 ? (
                      item.status === 'done' ? (
                        <Badge variant="success">
                          <CircleCheck aria-hidden="true" />
                          Marked as done
                        </Badge>
                      ) : (
                        'No tasks'
                      )
                    ) : item.status === 'done' ? (
                      <Badge variant="success">
                        <CircleCheck aria-hidden="true" />
                        All tasks done
                      </Badge>
                    ) : (
                      `${item.doneCount} of ${taskCount(item.totalCount)} done`
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button asChild variant="outline">
                      <Link
                        to={`/onboard/checklists/${item.subjectId}`}
                        aria-label={`Open the checklist for ${nameOf(item)}`}
                      >
                        Open
                      </Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {data && data.items.length === 0 && (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={5} className="p-0">
                    <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
                      <span
                        aria-hidden="true"
                        className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground"
                      >
                        <ClipboardCheck className="size-5" />
                      </span>
                      <p className="font-medium">
                        {filter === 'open' ? 'No open checklists.' : 'No finished checklists yet.'}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Choosing a template with manual tasks, or giving a manager or a start date,
                        when you onboard someone creates one.
                      </p>
                    </div>
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
