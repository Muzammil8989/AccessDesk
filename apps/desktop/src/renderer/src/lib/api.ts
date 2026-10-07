import type { z } from 'zod';
import type { ApiQuery } from '../../../shared/ipc';

export class ApiRequestError extends Error {
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

export async function apiGet<S extends z.ZodType>(
  path: string,
  schema: S,
  query?: ApiQuery,
): Promise<z.infer<S>> {
  const response = await window.accessdesk.api.get(path, query);
  if (!response.ok) throw new ApiRequestError(response.message, response.status);

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
