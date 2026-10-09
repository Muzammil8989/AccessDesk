import type { Employee } from '@accessdesk/shared';
import { useQuery } from '@tanstack/react-query';
import { Search, UserCheck, X } from 'lucide-react';
import { useId, useState } from 'react';
import type { FieldError } from 'react-hook-form';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { ApiRequestError } from '@/lib/api';
import { EMPLOYEE_PAGE_SIZE, employeesQuery } from '@/lib/employees-api';

export const MANAGER_FIELD_ID = 'manager-field';
const MIN_SEARCH_LENGTH = 2;

export const nameOfEmployee = (employee: Employee): string =>
  [employee.firstName, employee.lastName].filter(Boolean).join(' ') || employee.username;

interface ManagerPickerProps {
  selected: Employee | null;
  onSelect: (employee: Employee | null) => void;
  error?: FieldError;
}

/**
 * Picks one person as the manager. Search, then choose from a native radio group (arrow keys move
 * between people), then confirm with a button, so moving through the list never picks anyone by
 * accident. People with a disabled account are listed but cannot be chosen.
 */
export function ManagerPicker({ selected, onSelect, error }: ManagerPickerProps) {
  const hintId = useId();
  const errorId = useId();
  const [searchText, setSearchText] = useState('');
  const [pending, setPending] = useState<string | null>(null);
  const search = useDebouncedValue(searchText.trim(), 300);
  const searching = search.length >= MIN_SEARCH_LENGTH;
  const results = useQuery({ ...employeesQuery(search, 0), enabled: searching && !selected });

  const describedBy = [hintId, error ? errorId : null].filter(Boolean).join(' ');

  function confirm() {
    const chosen = results.data?.items.find((employee) => employee.id === pending);
    if (!chosen || !chosen.enabled) return;
    onSelect(chosen);
    setSearchText('');
    setPending(null);
  }

  return (
    <fieldset
      id={MANAGER_FIELD_ID}
      tabIndex={-1}
      aria-describedby={describedBy}
      className="flex min-w-0 flex-col gap-2 outline-none"
    >
      <legend className="mb-1 text-sm font-medium">Manager (optional)</legend>

      {selected ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/30 px-4 py-3 text-sm">
          <div className="flex min-w-0 items-center gap-3">
            <Avatar name={nameOfEmployee(selected)} className="size-9" />
            <div className="min-w-0">
              <span className="block truncate font-medium">{nameOfEmployee(selected)}</span>
              <span className="block truncate text-xs text-muted-foreground">
                {selected.username}
              </span>
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            aria-label={`Remove ${nameOfEmployee(selected)} as manager`}
            onClick={() => onSelect(null)}
          >
            <X />
            Remove
          </Button>
        </div>
      ) : (
        <>
          <div className="relative">
            <Search
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              type="search"
              className="pl-9"
              aria-label="Search for a manager"
              aria-describedby={describedBy}
              placeholder="Search by name, username or email"
              autoComplete="off"
              value={searchText}
              onChange={(event) => {
                setSearchText(event.target.value);
                setPending(null);
              }}
            />
          </div>

          {searching && results.isPending && (
            <div role="status" aria-label="Searching" className="flex flex-col gap-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          )}

          {searching && results.isError && (
            <Alert variant="destructive" role="alert">
              <AlertDescription className="mt-0 text-foreground">
                {results.error instanceof ApiRequestError
                  ? results.error.message
                  : 'Could not search.'}
              </AlertDescription>
              <Button
                type="button"
                variant="outline"
                className="mt-3"
                onClick={() => void results.refetch()}
              >
                Try again
              </Button>
            </Alert>
          )}

          {searching && results.data && results.data.items.length === 0 && (
            <p role="status" className="text-sm text-muted-foreground">
              No one matches “{search}”.
            </p>
          )}

          {searching && results.data && results.data.items.length > 0 && (
            <div className="flex flex-col gap-2">
              <fieldset className="min-w-0" aria-busy={results.isFetching}>
                <legend className="sr-only">People who match your search</legend>
                <ul className="flex flex-col divide-y overflow-hidden rounded-lg border">
                  {results.data.items.map((employee) => {
                    const inputId = `manager-choice-${employee.id}`;
                    return (
                      <li key={employee.id} className="text-sm">
                        <label
                          htmlFor={inputId}
                          className="flex min-h-12 cursor-pointer items-center gap-3 px-4 py-2 transition-colors duration-150 ease-standard hover:bg-accent/50 has-[:checked]:bg-accent has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60 has-[:disabled]:hover:bg-transparent"
                        >
                          <input
                            id={inputId}
                            type="radio"
                            name="manager-choice"
                            value={employee.id}
                            disabled={!employee.enabled}
                            checked={pending === employee.id}
                            onChange={() => setPending(employee.id)}
                            className="size-4 shrink-0 cursor-pointer accent-primary focus-visible:ring-2 focus-visible:ring-ring"
                          />
                          <Avatar name={nameOfEmployee(employee)} />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-medium">
                              {nameOfEmployee(employee)}
                            </span>
                            <span className="block truncate text-xs text-muted-foreground">
                              {employee.username}
                              {!employee.enabled && (
                                <span className="sr-only">
                                  {' '}
                                  (account disabled, cannot be chosen)
                                </span>
                              )}
                            </span>
                          </span>
                          {!employee.enabled && (
                            <Badge variant="secondary" aria-hidden="true">
                              Disabled
                            </Badge>
                          )}
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </fieldset>
              {results.data.total > EMPLOYEE_PAGE_SIZE && (
                <p className="text-xs text-muted-foreground">
                  Showing the first {EMPLOYEE_PAGE_SIZE} of {results.data.total}. Type more to
                  narrow the search.
                </p>
              )}
              <div>
                <Button type="button" disabled={pending === null} onClick={confirm}>
                  <UserCheck />
                  Use this person as manager
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      <p id={hintId} className="text-xs text-muted-foreground">
        {selected
          ? 'The manager is saved on the checklist by ID. Their name is looked up each time it is shown.'
          : `Type at least ${MIN_SEARCH_LENGTH} letters to search the identity provider.`}
      </p>
      {error && (
        <p id={errorId} role="alert" className="text-xs text-destructive">
          {error.message}
        </p>
      )}
    </fieldset>
  );
}
