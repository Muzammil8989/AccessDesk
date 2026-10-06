import type { FastifyInstance } from 'fastify';

export interface HealthDeps {
  /** Resolves when the database answers, rejects otherwise. */
  checkDatabase: () => Promise<void>;
}

// Both endpoints are public (load balancers and orchestrators call them without a token) and
// exempt from the rate limit. They never include error details.
const PROBE_CONFIG = { public: true, rateLimit: false } as const;

export function healthRoutes(app: FastifyInstance, deps: HealthDeps): void {
  // Liveness: the process is up. Does not touch the database.
  app.get('/health', { config: PROBE_CONFIG }, async () => ({ status: 'ok' }));

  // Readiness: the process can do useful work, so its database must answer.
  app.get('/ready', { config: PROBE_CONFIG }, async (request, reply) => {
    try {
      await deps.checkDatabase();
      return { status: 'ready' };
    } catch (error) {
      request.log.error({ err: error }, 'Readiness check failed');
      return reply.code(503).send({ status: 'unavailable', reason: 'database' });
    }
  });
}
