import {
  employeeDetailSchema,
  employeeFilterOptionsSchema,
  employeeListSchema,
} from '@accessdesk/shared';
import { keepPreviousData, queryOptions } from '@tanstack/react-query';
import { apiGet, retryable } from './api';

export const EMPLOYEE_PAGE_SIZE = 20;

export type StatusFilter = 'any' | 'active' | 'disabled';

// Group and role are alternatives: the identity provider can list the members of one group or
// the holders of one role, not both, so the screen never sends both.
export interface EmployeeFilters {
  status: StatusFilter;
  groupId: string;
  role: string;
}

export const NO_FILTERS: EmployeeFilters = { status: 'any', groupId: '', role: '' };

export const hasFilters = (filters: EmployeeFilters) =>
  filters.status !== 'any' || filters.groupId !== '' || filters.role !== '';

export const employeesQuery = (
  search: string,
  page: number,
  filters: EmployeeFilters = NO_FILTERS,
) =>
  queryOptions({
    queryKey: ['employees', search, page, filters],
    queryFn: () =>
      apiGet('/employees', employeeListSchema, {
        ...(search ? { search } : {}),
        ...(filters.status === 'any' ? {} : { enabled: String(filters.status === 'active') }),
        ...(filters.groupId ? { groupId: filters.groupId } : {}),
        ...(filters.role ? { role: filters.role } : {}),
        first: page * EMPLOYEE_PAGE_SIZE,
        max: EMPLOYEE_PAGE_SIZE,
      }),
    placeholderData: keepPreviousData,
    retry: retryable,
  });

export const employeeDetailQuery = (id: string) =>
  queryOptions({
    queryKey: ['employee', id],
    queryFn: () => apiGet(`/employees/${id}`, employeeDetailSchema),
    retry: retryable,
  });

export const employeeFilterOptionsQuery = queryOptions({
  queryKey: ['employee-filter-options'],
  queryFn: () => apiGet('/employees/filter-options', employeeFilterOptionsSchema),
  retry: retryable,
});
