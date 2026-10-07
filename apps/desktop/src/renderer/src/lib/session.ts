import { queryOptions } from '@tanstack/react-query';

export const settingsQuery = queryOptions({
  queryKey: ['settings'],
  queryFn: () => window.accessdesk.settings.get(),
});

export const authQuery = queryOptions({
  queryKey: ['auth'],
  queryFn: () => window.accessdesk.auth.status(),
});
