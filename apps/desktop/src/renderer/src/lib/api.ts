import type { z } from 'zod';
import type { ApiQuery, ApiResponse } from '../../../shared/ipc';

export class ApiRequestError extends Error {
  readonly retryable: boolean;

  constructor(
    message: string,
    readonly status: number,
    retryable = status === 0 || status >= 500,
    readonly code?: string,
  ) {
    super(message);
    this.name = 'ApiRequestError';
    this.retryable = retryable;
  }
}

const MAX_ATTEMPTS = 2;

/** The retry policy for read queries: try a transient failure once more, never a definite one. */
export const retryable = (count: number, error: Error) =>
  error instanceof ApiRequestError && error.retryable && count < MAX_ATTEMPTS;

export function parseResponse<S extends z.ZodType>(response: ApiResponse, schema: S): z.infer<S> {
  if (!response.ok) {
    throw new ApiRequestError(response.message, response.status, undefined, response.code);
  }

  const parsed = schema.safeParse(response.data);
  if (!parsed.success) {
    throw new ApiRequestError(
      'The server sent a response this version of the app does not understand.',
      502,
      false,
    );
  }
  return parsed.data;
}

export async function apiGet<S extends z.ZodType>(
  path: string,
  schema: S,
  query?: ApiQuery,
): Promise<z.infer<S>> {
  return parseResponse(await window.accessdesk.api.get(path, query), schema);
}
