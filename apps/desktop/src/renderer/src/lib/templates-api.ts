import { templateListSchema } from '@accessdesk/shared';
import { queryOptions } from '@tanstack/react-query';
import { ApiRequestError, apiGet } from './api';

const TEMPLATES_STALE_TIME_MS = 5 * 60_000;
const MAX_ATTEMPTS = 2;

export const templatesQuery = queryOptions({
  queryKey: ['templates'],
  queryFn: () => apiGet('/templates', templateListSchema),
  staleTime: TEMPLATES_STALE_TIME_MS,
  retry: (count, error) =>
    error instanceof ApiRequestError && error.retryable && count < MAX_ATTEMPTS,
});
