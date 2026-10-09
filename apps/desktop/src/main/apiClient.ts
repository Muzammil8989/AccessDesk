import {
  onboardEmployeeSchema,
  retryOnboardingSchema,
  setChecklistClosedSchema,
  setChecklistItemSchema,
  type AppSettings,
} from '@accessdesk/shared';
import { z } from 'zod';
import type { ApiQuery, ApiResponse } from '../shared/ipc';
import type { AuthService } from './auth/service';

const UUID = '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}';

export const apiPathSchema = z
  .string()
  .regex(
    new RegExp(`^/(employees(/${UUID})?|templates|onboarding/options|checklists(/${UUID})?)$`),
  );

const uuidSchema = z.uuid();

const errorBodySchema = z.object({ message: z.string(), error: z.string().optional() });

const READ_TIMEOUT_MS = 15_000;
const WRITE_TIMEOUT_MS = 30_000;

const INVALID_REQUEST: ApiResponse = { ok: false, status: 400, message: 'Invalid request' };

interface RequestOptions {
  method: 'GET' | 'POST' | 'PATCH';
  path: string;
  query?: ApiQuery;
  body?: unknown;
  timeoutMs: number;
}

export interface ApiClientDeps {
  getSettings(): Promise<AppSettings | null>;
  auth: Pick<AuthService, 'getAccessToken' | 'forceRefresh'>;
  fetch?: typeof globalThis.fetch;
}

export function createApiClient(deps: ApiClientDeps) {
  const doFetch = deps.fetch ?? fetch;

  async function send(url: string, token: string, options: RequestOptions): Promise<Response> {
    const hasBody = options.body !== undefined;
    return doFetch(url, {
      method: options.method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        ...(hasBody && { 'Content-Type': 'application/json' }),
      },
      body: hasBody ? JSON.stringify(options.body) : undefined,
      redirect: 'error',
      signal: AbortSignal.timeout(options.timeoutMs),
    });
  }

  async function request(options: RequestOptions): Promise<ApiResponse> {
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

    const url = new URL(`${settings.apiUrl}${options.path}`);
    for (const [key, value] of Object.entries(options.query ?? {})) {
      url.searchParams.set(key, String(value));
    }

    try {
      let response = await send(url.toString(), token, options);
      if (response.status === 401) {
        const fresh = await deps.auth.forceRefresh();
        if (fresh) response = await send(url.toString(), fresh, options);
      }

      const body: unknown = await response.json().catch(() => null);
      if (response.ok) return { ok: true, status: response.status, data: body };
      const parsed = errorBodySchema.safeParse(body);
      return {
        ok: false,
        status: response.status,
        message: parsed.success ? parsed.data.message : response.statusText || 'Request failed',
        ...(parsed.success && parsed.data.error !== undefined && { code: parsed.data.error }),
      };
    } catch {
      return {
        ok: false,
        status: 0,
        message: `Could not reach the AccessDesk API at ${settings.apiUrl}`,
      };
    }
  }

  return {
    get(path: string, query: ApiQuery = {}): Promise<ApiResponse> {
      return request({ method: 'GET', path, query, timeoutMs: READ_TIMEOUT_MS });
    },

    async createOnboarding(input: unknown): Promise<ApiResponse> {
      const parsed = onboardEmployeeSchema.safeParse(input);
      if (!parsed.success) return INVALID_REQUEST;
      return request({
        method: 'POST',
        path: '/onboarding',
        body: parsed.data,
        timeoutMs: WRITE_TIMEOUT_MS,
      });
    },

    async retryOnboarding(subjectId: unknown, input: unknown): Promise<ApiResponse> {
      const id = uuidSchema.safeParse(subjectId);
      const parsed = retryOnboardingSchema.safeParse(input);
      if (!id.success || !parsed.success) return INVALID_REQUEST;
      return request({
        method: 'POST',
        path: `/onboarding/${id.data}/retry`,
        body: parsed.data,
        timeoutMs: WRITE_TIMEOUT_MS,
      });
    },

    async setChecklistClosed(subjectId: unknown, input: unknown): Promise<ApiResponse> {
      const subject = uuidSchema.safeParse(subjectId);
      const parsed = setChecklistClosedSchema.safeParse(input);
      if (!subject.success || !parsed.success) return INVALID_REQUEST;
      return request({
        method: 'PATCH',
        path: `/checklists/${subject.data}`,
        body: parsed.data,
        timeoutMs: WRITE_TIMEOUT_MS,
      });
    },

    async setChecklistItem(
      subjectId: unknown,
      itemId: unknown,
      input: unknown,
    ): Promise<ApiResponse> {
      const subject = uuidSchema.safeParse(subjectId);
      const item = uuidSchema.safeParse(itemId);
      const parsed = setChecklistItemSchema.safeParse(input);
      if (!subject.success || !item.success || !parsed.success) return INVALID_REQUEST;
      return request({
        method: 'PATCH',
        path: `/checklists/${subject.data}/items/${item.data}`,
        body: parsed.data,
        timeoutMs: WRITE_TIMEOUT_MS,
      });
    },
  };
}
