import type { AppSettings } from '@accessdesk/shared';
import { z } from 'zod';
import type { ApiQuery, ApiResponse } from '../shared/ipc';
import type { AuthService } from './auth/service';

export const apiPathSchema = z.string().regex(/^\/[a-z][a-z0-9-]*(\/[A-Za-z0-9-]+)*$/);

const errorBodySchema = z.object({ message: z.string() });

export interface ApiClientDeps {
  getSettings(): Promise<AppSettings | null>;
  auth: Pick<AuthService, 'getAccessToken' | 'forceRefresh'>;
  fetch?: typeof globalThis.fetch;
}

export function createApiClient(deps: ApiClientDeps) {
  const doFetch = deps.fetch ?? fetch;

  async function send(url: string, token: string): Promise<Response> {
    return doFetch(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      redirect: 'error',
      signal: AbortSignal.timeout(15_000),
    });
  }

  return {
    async get(path: string, query: ApiQuery = {}): Promise<ApiResponse> {
      const settings = await deps.getSettings();
      if (!settings) return { ok: false, status: 0, message: 'The app is not configured yet' };

      let token: string | null;
      try {
        token = await deps.auth.getAccessToken();
      } catch {
        return {
          ok: false,
          status: 0,
          message: 'Could not reach the identity provider to renew your session',
        };
      }
      if (!token) return { ok: false, status: 401, message: 'You are not signed in' };

      const url = new URL(`${settings.apiUrl}${path}`);
      for (const [key, value] of Object.entries(query)) url.searchParams.set(key, String(value));

      try {
        let response = await send(url.toString(), token);
        if (response.status === 401) {
          const fresh = await deps.auth.forceRefresh();
          if (fresh) response = await send(url.toString(), fresh);
        }

        const body: unknown = await response.json().catch(() => null);
        if (response.ok) return { ok: true, status: response.status, data: body };
        const parsed = errorBodySchema.safeParse(body);
        return {
          ok: false,
          status: response.status,
          message: parsed.success ? parsed.data.message : response.statusText || 'Request failed',
        };
      } catch {
        return {
          ok: false,
          status: 0,
          message: `Could not reach the AccessDesk API at ${settings.apiUrl}`,
        };
      }
    },
  };
}
