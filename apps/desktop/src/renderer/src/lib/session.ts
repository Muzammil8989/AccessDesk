import { queryOptions } from '@tanstack/react-query';

// Settings and sign-in state live in the main process. These queries mirror them in the UI.
export const settingsQuery = queryOptions({
  queryKey: ['settings'],
  queryFn: () => window.accessdesk.settings.get(),
});

export const authQuery = queryOptions({
  queryKey: ['auth'],
  queryFn: () => window.accessdesk.auth.status(),
});
