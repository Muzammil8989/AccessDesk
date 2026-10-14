import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { ApiRequestError } from '@/lib/api';
import { authQuery } from '@/lib/session';

/**
 * A 401 means the session ended. Refetching the auth status lets the app shell send the admin to
 * sign in again instead of leaving each screen to show a generic error.
 */
export function useReauthOn401(error: unknown): void {
  const queryClient = useQueryClient();
  const status = error instanceof ApiRequestError ? error.status : null;
  useEffect(() => {
    if (status === 401) void queryClient.invalidateQueries({ queryKey: authQuery.queryKey });
  }, [status, queryClient]);
}
