import { canAccess, type Employee } from '@accessdesk/shared';
import { useQuery } from '@tanstack/react-query';
import {
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  CircleSlash,
  SearchX,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { EmptyState } from '@/components/empty-state';
import { PageHeader } from '@/components/page-header';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { SearchField } from '@/components/ui/search-field';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { SelectField } from '@/components/ui/select-field';
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
import { useReauthOn401 } from '@/hooks/use-reauth-on-401';
import { ApiRequestError } from '@/lib/api';
import {
  EMPLOYEE_PAGE_SIZE,
  employeeFilterOptionsQuery,
  employeesQuery,
  hasFilters,
  type EmployeeFilters,
  type StatusFilter,
} from '@/lib/employees-api';
import { authQuery } from '@/lib/session';
import { cn } from '@/lib/utils';

const PAGE_SIZE = EMPLOYEE_PAGE_SIZE;
const COLUMNS = 3;

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: 'any', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'disabled', label: 'Disabled' },
];

const GROUP_HINT = 'Direct members only; people in subgroups are not included.';
const ROLE_HINT = 'Only people who hold this role directly are shown.';

// The filters and the page live in the URL, so coming back from a detail screen restores them.
function readFilters(params: URLSearchParams): EmployeeFilters {
  const status = params.get('status');
  return {
    status: status === 'active' || status === 'disabled' ? status : 'any',
    groupId: params.get('group') ?? '',
    role: params.get('role') ?? '',
  };
}

function readPage(params: URLSearchParams): number {
  const page = Number.parseInt(params.get('page') ?? '', 10);
  return Number.isInteger(page) && page > 0 ? page : 0;
}

function nameOf(employee: Employee): string {
  return [employee.firstName, employee.lastName].filter(Boolean).join(' ');
}

/** One applied filter, as an M3 filter chip in its selected state, with a way to take it off. */
function FilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <li className="inline-flex h-8 items-center gap-1 rounded-sm bg-secondary-container pr-1 pl-3 text-label-large text-on-secondary-container">
      {label}
      <button
        type="button"
        aria-label={`Remove filter ${label}`}
        onClick={onRemove}
        className="state-layer grid size-6 cursor-pointer place-items-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <X className="size-[18px]" aria-hidden="true" />
      </button>
    </li>
  );
}

export function EmployeesPage() {
  const [params, setParams] = useSearchParams();
  const filters = readFilters(params);
  const page = readPage(params);
  const [searchText, setSearchText] = useState(params.get('q') ?? '');
  const search = useDebouncedValue(searchText.trim(), 300);

  const auth = useQuery(authQuery);
  const employees = useQuery(employeesQuery(search, page, filters));
  const options = useQuery(employeeFilterOptionsQuery);

  const canOnboard =
    auth.data !== undefined &&
    canAccess(auth.data.roles, 'onboard', auth.data.adminRoles, auth.data.superAdminRole);

  // Every change goes back to the first page, because the old page may not exist any more.
  function change(edit: (next: URLSearchParams) => void) {
    setParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        edit(next);
        next.delete('page');
        return next;
      },
      { replace: true },
    );
  }

  function goToPage(update: (current: number) => number) {
    setParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        const target = update(readPage(previous));
        if (target > 0) next.set('page', String(target));
        else next.delete('page');
        return next;
      },
      { replace: true },
    );
  }

  function clearFilters() {
    change((next) => {
      next.delete('status');
      next.delete('group');
      next.delete('role');
    });
  }

  useEffect(() => {
    if ((params.get('q') ?? '') === search) return;
    setParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        if (search) next.set('q', search);
        else next.delete('q');
        return next;
      },
      { replace: true },
    );
  }, [search, params, setParams]);

  useReauthOn401(employees.error);
  const status = employees.error instanceof ApiRequestError ? employees.error.status : null;

  const data = employees.data;
  const total = data?.total ?? 0;
  const from = total === 0 ? 0 : page * PAGE_SIZE + 1;
  const to = Math.min((page + 1) * PAGE_SIZE, total);
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const refreshing = employees.isFetching && !employees.isPending;
  const capped = data?.capped ?? false;
  const filtered = hasFilters(filters);

  // A page left over from an earlier, longer list may no longer exist.
  const strandedOnEmptyPage =
    page > 0 && data !== undefined && data.items.length === 0 && !employees.isFetching;
  useEffect(() => {
    if (strandedOnEmptyPage) goToPage(() => 0);
    // goToPage only reads setParams, which is stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [strandedOnEmptyPage]);

  const groupName = options.data
    ? (options.data.groups.find((group) => group.id === filters.groupId)?.name ?? 'Unknown group')
    : options.isPending
      ? 'Loading…'
      : 'Unknown group';
  const chips = [
    ...(filters.status !== 'any'
      ? [
          {
            key: 'status',
            label: `Status: ${filters.status === 'active' ? 'Active' : 'Disabled'}`,
            remove: () => change((next) => next.delete('status')),
          },
        ]
      : []),
    ...(filters.groupId
      ? [
          {
            key: 'group',
            label: `Group: ${groupName}`,
            remove: () => change((next) => next.delete('group')),
          },
        ]
      : []),
    ...(filters.role
      ? [
          {
            key: 'role',
            label: `Role: ${filters.role}`,
            remove: () => change((next) => next.delete('role')),
          },
        ]
      : []),
  ];

  const onboardButton = canOnboard && (
    <Button asChild>
      <Link to="/onboard">
        <UserPlus />
        Onboard employee
      </Link>
    </Button>
  );

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Employees"
        description={
          <>
            Everyone in your identity provider.
            {data && total > 0 && (
              <span className="tabular-nums">
                {' '}
                {capped ? 'At least ' : ''}
                {total} {total === 1 ? 'person' : 'people'}
                {filtered || search ? ' match.' : ' in total.'}
              </span>
            )}
          </>
        }
        actions={onboardButton || undefined}
      />

      <section aria-label="Find employees" className="flex flex-col gap-4">
        <SearchField
          aria-label="Search employees"
          placeholder="Search by name, username or email"
          value={searchText}
          onChange={(event) => {
            setSearchText(event.target.value);
            goToPage(() => 0);
          }}
        />

        <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
          <SegmentedControl
            label="Status"
            value={filters.status}
            options={STATUS_OPTIONS}
            onChange={(value) =>
              change((next) => {
                if (value === 'any') next.delete('status');
                else next.set('status', value);
              })
            }
          />
          <div className="grid min-w-0 flex-1 gap-4 sm:grid-cols-2">
            <SelectField
              id="employee-group"
              label="Group"
              hint={filters.role ? 'Clear the role filter to filter by group.' : GROUP_HINT}
              hintHidden
              value={filters.groupId}
              disabled={!options.data || filters.role !== ''}
              onChange={(event) =>
                change((next) => {
                  next.delete('role');
                  if (event.target.value) next.set('group', event.target.value);
                  else next.delete('group');
                })
              }
            >
              <option value="">{filters.role ? 'Not available with a role' : 'Any group'}</option>
              {options.data?.groups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
            </SelectField>
            <SelectField
              id="employee-role"
              label="Role"
              hint={filters.groupId ? 'Clear the group filter to filter by role.' : ROLE_HINT}
              hintHidden
              value={filters.role}
              disabled={!options.data || filters.groupId !== ''}
              onChange={(event) =>
                change((next) => {
                  next.delete('group');
                  if (event.target.value) next.set('role', event.target.value);
                  else next.delete('role');
                })
              }
            >
              <option value="">
                {filters.groupId ? 'Not available with a group' : 'Any role'}
              </option>
              {options.data?.roles.map((role) => (
                <option key={role.name} value={role.name}>
                  {role.name}
                </option>
              ))}
            </SelectField>
          </div>
        </div>

        {options.isError && (
          <Alert variant="warning">
            <AlertTitle>Group and role filters could not be loaded</AlertTitle>
            <AlertDescription>
              <p>{options.error.message}</p>
            </AlertDescription>
            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() => void options.refetch()}
            >
              Try again
            </Button>
          </Alert>
        )}

        {filtered && (
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <ul aria-label="Applied filters" className="flex flex-wrap items-center gap-2">
                {chips.map((chip) => (
                  <FilterChip key={chip.key} label={chip.label} onRemove={chip.remove} />
                ))}
              </ul>
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                Clear filters
              </Button>
            </div>
            {(filters.groupId || filters.role) && (
              <p className="text-body-small text-on-surface-variant">
                {filters.groupId ? GROUP_HINT : ROLE_HINT} A group and a role cannot be combined.
              </p>
            )}
          </div>
        )}
      </section>

      {capped && (
        <Alert variant="warning">
          <AlertTitle>This list may be incomplete</AlertTitle>
          <AlertDescription>
            <p>
              {filters.groupId ? 'This group' : 'This role'} has more people than AccessDesk can
              read at once. The list and the count only cover part of it.
            </p>
          </AlertDescription>
        </Alert>
      )}

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
          <div className="mt-3 flex gap-2">
            <Button variant="outline" size="sm" onClick={() => void employees.refetch()}>
              Try again
            </Button>
            {filtered && (
              <Button variant="outline" size="sm" onClick={clearFilters}>
                Clear filters
              </Button>
            )}
          </div>
        </Alert>
      ) : (
        <div
          className={cn(
            'overflow-hidden rounded-md border border-outline-variant bg-surface transition-opacity duration-150 ease-standard',
            refreshing && 'opacity-70',
          )}
          aria-busy={employees.isFetching}
        >
          <Table containerClassName="max-h-[calc(100vh-18rem)] min-h-48 overflow-auto">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Name</TableHead>
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
                        <Skeleton className="size-10 rounded-full" />
                        <div className="flex flex-col gap-1.5">
                          <Skeleton className="h-4 w-28" />
                          <Skeleton className="h-3 w-20" />
                        </div>
                      </div>
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
                      <div className="min-w-0">
                        <p className="truncate text-body-large">{nameOf(employee) || '—'}</p>
                        <p className="truncate text-body-small text-on-surface-variant">
                          {employee.username}
                        </p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="break-all text-on-surface-variant">
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
                    {filtered ? (
                      <EmptyState icon={SearchX}>
                        <p className="text-title-medium">No employees match these filters.</p>
                        <p className="text-body-medium text-on-surface-variant">
                          {search
                            ? `Nobody matches “${search}” with the chosen filters.`
                            : 'Try a different status, group or role.'}
                        </p>
                        <Button
                          variant="outline"
                          size="sm"
                          className="mt-2"
                          onClick={() => {
                            setSearchText('');
                            change((next) => {
                              next.delete('status');
                              next.delete('group');
                              next.delete('role');
                              next.delete('q');
                            });
                          }}
                        >
                          Clear search and filters
                        </Button>
                      </EmptyState>
                    ) : search ? (
                      <EmptyState icon={SearchX}>
                        <p className="text-title-medium">No employees match “{search}”.</p>
                        <p className="text-body-medium text-on-surface-variant">
                          Try a different name, username or email.
                        </p>
                        <Button
                          variant="outline"
                          size="sm"
                          className="mt-2"
                          onClick={() => {
                            setSearchText('');
                            goToPage(() => 0);
                          }}
                        >
                          Clear search
                        </Button>
                      </EmptyState>
                    ) : (
                      <EmptyState icon={Users}>
                        <p className="text-title-medium">No employees found.</p>
                        <p className="text-body-medium text-on-surface-variant">
                          People you onboard will show up here.
                        </p>
                        {onboardButton && <div className="mt-2">{onboardButton}</div>}
                      </EmptyState>
                    )}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-outline-variant px-4 py-3 text-body-medium text-on-surface-variant">
            <span role="status">
              {total > 0
                ? `Showing ${from}–${to} of ${capped ? 'at least ' : ''}${total}`
                : data
                  ? '0 results'
                  : ''}
            </span>
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
                  onClick={() => goToPage((p) => p - 1)}
                  disabled={page === 0}
                >
                  <ChevronLeft /> Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => goToPage((p) => p + 1)}
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
