import type { z } from 'zod';
import type { ApiQuery } from '../../../shared/ipc';

export class ApiRequestError extends Error {
  /** Whether trying again can help: network failures (0) and server faults (5xx) can pass. */
  readonly retryable: boolean;

  constructor(
    message: string,
    readonly status: number,
    retryable = status === 0 || status >= 500,
  ) {
    super(message);
    this.name = 'ApiRequestError';
    this.retryable = retryable;
  }
}

/**
 * GET through the main process, which adds the access token. The response is checked against
 * the shared Zod schema, so the UI never trusts the shape of data it receives.
 */
export async function apiGet<S extends z.ZodType>(
  path: string,
  schema: S,
  query?: ApiQuery,
): Promise<z.infer<S>> {
  const response = await window.accessdesk.api.get(path, query);
  if (!response.ok) throw new ApiRequestError(response.message, response.status);

  const parsed = schema.safeParse(response.data);
  if (!parsed.success) {
    // Never show raw validation output to a user. A wrong shape is a bug or a version mismatch
    // between app and API, and asking again returns the same thing, so do not retry.
    throw new ApiRequestError(
      'The server sent a response this version of the app does not understand.',
      502,
      false,
    );
  }
  return parsed.data;
}
