import { templateListSchema } from '@accessdesk/shared';
import { queryOptions } from '@tanstack/react-query';
import { apiGet, retryable } from './api';

const TEMPLATES_STALE_TIME_MS = 5 * 60_000;

export const templatesQuery = queryOptions({
  queryKey: ['templates'],
  queryFn: () => apiGet('/templates', templateListSchema),
  staleTime: TEMPLATES_STALE_TIME_MS,
  retry: retryable,
});
