import { IdentityProviderError } from '@accessdesk/identity';
import type { FastifyInstance } from 'fastify';
import { ZodError } from 'zod';
import { AppError } from '../errors';

const PASS_THROUGH_STATUSES = [401, 403, 404];

const CLIENT_ERROR_CODES: Record<number, string> = {
  400: 'bad_request',
  401: 'unauthorized',
  403: 'forbidden',
  404: 'not_found',
  413: 'payload_too_large',
  429: 'too_many_requests',
};

export function registerErrorHandler(app: FastifyInstance): void {
  app.setNotFoundHandler((_request, reply) =>
    reply.code(404).send({ error: 'not_found', message: 'Route not found' }),
  );

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ZodError) {
      return reply.code(400).send({
        error: 'bad_request',
        message: error.issues.map((i) => `${i.path.join('.') || 'input'}: ${i.message}`).join('; '),
      });
    }
    if (error instanceof AppError) {
      return reply.code(error.statusCode).send({ error: error.code, message: error.message });
    }
    if (error instanceof IdentityProviderError) {
      const status = PASS_THROUGH_STATUSES.includes(error.status) ? error.status : 502;
      request.log.warn(
        { identityProviderStatus: error.status },
        'Identity provider request failed',
      );
      return reply.code(status).send({ error: 'identity_error', message: error.message });
    }

    const status = (error as { statusCode?: unknown }).statusCode;
    if (typeof status === 'number' && status >= 400 && status < 500) {
      return reply.code(status).send({
        error: CLIENT_ERROR_CODES[status] ?? 'request_error',
        message: error instanceof Error ? error.message : 'Bad request',
      });
    }

    request.log.error(error);
    return reply.code(500).send({ error: 'internal', message: 'Internal server error' });
  });
}
