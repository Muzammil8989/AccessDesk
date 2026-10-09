import { employeeListSchema } from '@accessdesk/shared';
import { keepPreviousData, queryOptions } from '@tanstack/react-query';
import { ApiRequestError, apiGet } from './api';

export const EMPLOYEE_PAGE_SIZE = 20;
const MAX_ATTEMPTS = 2;

export const employeesQuery = (search: string, page: number) =>
  queryOptions({
    queryKey: ['employees', search, page],
    queryFn: () =>
      apiGet('/employees', employeeListSchema, {
        ...(search ? { search } : {}),
        first: page * EMPLOYEE_PAGE_SIZE,
        max: EMPLOYEE_PAGE_SIZE,
      }),
    placeholderData: keepPreviousData,
    retry: (count, error: Error) =>
      error instanceof ApiRequestError && error.retryable && count < MAX_ATTEMPTS,
  });
