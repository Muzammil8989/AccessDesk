import { randomUUID } from 'node:crypto';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import Fastify, { type FastifyInstance } from 'fastify';
import type { JWTVerifyGetKey } from 'jose';
import type { Config } from './config';
import type { KeycloakClientFactory } from './infra/keycloak';
import { employeeRoutes } from './modules/employees/employees.routes';
import { healthRoutes } from './modules/health/health.routes';
import type { TemplateRepository } from './modules/templates/templates.repository';
import { templateRoutes } from './modules/templates/templates.routes';
import { registerAuth } from './plugins/auth';
import { registerErrorHandler } from './plugins/error-handler';

/**
 * Everything the app needs from the outside world. `server.ts` supplies the real thing;
 * tests supply fakes. Modules depend on these abstractions, never on Prisma or fetch directly.
 */
export interface AppDeps {
  config: Config;
  templates: TemplateRepository;
  keycloakFor: KeycloakClientFactory;
  checkDatabase: () => Promise<void>;
  /** Tests pass a local key set instead of calling Keycloak's JWKS endpoint. */
  keyResolver?: JWTVerifyGetKey;
}

export async function buildApp(deps: AppDeps): Promise<FastifyInstance> {
  const { config } = deps;
  const app = Fastify({
    logger: {
      level: config.logLevel,
      // Fastify's default request log has no headers, but redact anyway as a safety net.
      redact: ['req.headers.authorization', 'req.headers.cookie'],
      transport: ['production', 'test'].includes(process.env.NODE_ENV ?? '')
        ? undefined
        : { target: 'pino-pretty' },
    },
    trustProxy: config.trustProxy,
    // Limits: this API only reads small JSON, so refuse big bodies and slow clients early.
    bodyLimit: 100 * 1024,
    connectionTimeout: 30_000,
    requestTimeout: 30_000,
    // A fresh unguessable ID per request, returned to the caller to correlate logs and bug reports.
    genReqId: () => randomUUID(),
  });

  app.addHook('onSend', async (request, reply) => {
    reply.header('x-request-id', request.id);
  });

  registerErrorHandler(app);

  await app.register(helmet);
  // Registered BEFORE auth so that floods of bad tokens are throttled too.
  await app.register(rateLimit, {
    max: config.rateLimitPerMinute,
    timeWindow: '1 minute',
  });

  registerAuth(app, {
    issuer: config.issuer,
    audience: config.audience,
    keyResolver: deps.keyResolver,
  });

  healthRoutes(app, { checkDatabase: deps.checkDatabase });
  templateRoutes(app, deps.templates);
  employeeRoutes(app, { keycloakFor: deps.keycloakFor });

  return app;
}
