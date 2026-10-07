import type { FastifyInstance } from 'fastify';

export interface HealthDeps {
  checkDatabase: () => Promise<void>;
}

const PROBE_CONFIG = { public: true, rateLimit: false } as const;

export function healthRoutes(app: FastifyInstance, deps: HealthDeps): void {
  app.get('/health', { config: PROBE_CONFIG }, async () => ({ status: 'ok' }));

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
