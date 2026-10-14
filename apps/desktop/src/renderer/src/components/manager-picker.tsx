import type { Employee } from '@accessdesk/shared';
import { useQuery } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { useId, useState } from 'react';
import type { FieldError as FieldErrorValue } from 'react-hook-form';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FieldError } from '@/components/ui/field';
import { SearchField } from '@/components/ui/search-field';
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
  error?: FieldErrorValue;
}

/**
 * Picks one person as the manager: search, then choose a person from the list. One step, because
 * the chosen person is shown with a Remove button right away, so a wrong pick costs one click to
 * undo. People with a disabled account are listed but cannot be chosen.
 */
export function ManagerPicker({ selected, onSelect, error }: ManagerPickerProps) {
  const hintId = useId();
  const errorId = useId();
  const [searchText, setSearchText] = useState('');
  const search = useDebouncedValue(searchText.trim(), 300);
  const searching = search.length >= MIN_SEARCH_LENGTH;
  const results = useQuery({ ...employeesQuery(search, 0), enabled: searching && !selected });

  const describedBy = [hintId, error ? errorId : null].filter(Boolean).join(' ');

  function choose(employee: Employee) {
    if (!employee.enabled) return;
    onSelect(employee);
    setSearchText('');
  }

  return (
    <fieldset
      id={MANAGER_FIELD_ID}
      tabIndex={-1}
      aria-describedby={describedBy}
      className="flex min-w-0 flex-col gap-2 outline-none"
    >
      <legend className="mb-1 text-label-large">Manager (optional)</legend>

      {selected ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-surface-container-highest px-4 py-3 text-body-medium">
          <div className="flex min-w-0 items-center gap-3">
            <Avatar name={nameOfEmployee(selected)} />
            <div className="min-w-0">
              <span className="block truncate text-body-large">{nameOfEmployee(selected)}</span>
              <span className="block truncate text-body-small text-on-surface-variant">
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
          <SearchField
            aria-label="Search for a manager"
            aria-describedby={describedBy}
            placeholder="Search by name, username or email"
            autoComplete="off"
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
          />

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
            <p role="status" className="px-4 text-body-medium text-on-surface-variant">
              No one matches “{search}”.
            </p>
          )}

          {searching && results.data && results.data.items.length > 0 && (
            <div className="flex flex-col gap-2">
              <ul
                aria-label="People who match your search"
                aria-busy={results.isFetching}
                className="flex flex-col divide-y divide-outline-variant overflow-hidden rounded-md border border-outline-variant"
              >
                {results.data.items.map((employee) => (
                  <li key={employee.id} className="text-body-medium">
                    <button
                      type="button"
                      disabled={!employee.enabled}
                      onClick={() => choose(employee)}
                      className="state-layer flex min-h-14 w-full cursor-pointer items-center gap-3 px-4 py-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <Avatar name={nameOfEmployee(employee)} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-body-large">
                          {nameOfEmployee(employee)}
                        </span>
                        <span className="block truncate text-body-small text-on-surface-variant">
                          {employee.username}
                          {!employee.enabled && (
                            <span className="sr-only"> (account disabled, cannot be chosen)</span>
                          )}
                        </span>
                      </span>
                      {!employee.enabled && (
                        <Badge variant="secondary" aria-hidden="true">
                          Disabled
                        </Badge>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
              {results.data.total > EMPLOYEE_PAGE_SIZE && (
                <p className="px-4 text-body-small text-on-surface-variant">
                  Showing the first {EMPLOYEE_PAGE_SIZE} of {results.data.total}. Type more to
                  narrow the search.
                </p>
              )}
            </div>
          )}
        </>
      )}

      <p id={hintId} className="px-4 text-body-small text-on-surface-variant">
        {selected
          ? 'The manager is saved on the checklist by ID. Their name is looked up each time it is shown.'
          : `Type at least ${MIN_SEARCH_LENGTH} letters to search the identity provider.`}
      </p>
      {error && <FieldError id={errorId}>{error.message}</FieldError>}
    </fieldset>
  );
}
