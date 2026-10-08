import { randomUUID } from 'node:crypto';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import Fastify, { type FastifyInstance } from 'fastify';
import type { JWTVerifyGetKey } from 'jose';
import type { Config } from './config';
import type { IdentityProviderFactory } from './infra/identity';
import type { AuditRepository } from './modules/audit/audit.repository';
import { employeeRoutes } from './modules/employees/employees.routes';
import { healthRoutes } from './modules/health/health.routes';
import { onboardingRoutes } from './modules/onboarding/onboarding.routes';
import { generateTemporaryPassword } from './modules/onboarding/temporary-password';
import type { TemplateRepository } from './modules/templates/templates.repository';
import { templateRoutes } from './modules/templates/templates.routes';
import { registerAuth } from './plugins/auth';
import { registerErrorHandler } from './plugins/error-handler';

export interface AppDeps {
  config: Config;
  templates: TemplateRepository;
  audit: AuditRepository;
  identityFor: IdentityProviderFactory;
  checkDatabase: () => Promise<void>;
  keyResolver?: JWTVerifyGetKey;
  fetch?: typeof globalThis.fetch;
  clock?: () => Date;
  generatePassword?: () => string;
  logStream?: NodeJS.WritableStream;
}

export async function buildApp(deps: AppDeps): Promise<FastifyInstance> {
  const { config } = deps;
  const app = Fastify({
    logger: {
      level: config.logLevel,
      redact: ['req.headers.authorization', 'req.headers.cookie'],
      stream: deps.logStream,
      transport:
        deps.logStream || ['production', 'test'].includes(process.env.NODE_ENV ?? '')
          ? undefined
          : { target: 'pino-pretty' },
    },
    trustProxy: config.trustProxy,
    bodyLimit: 100 * 1024,
    connectionTimeout: 30_000,
    requestTimeout: 30_000,
    genReqId: () => randomUUID(),
  });

  app.addHook('onSend', async (request, reply) => {
    reply.header('x-request-id', request.id);
  });

  registerErrorHandler(app);

  await app.register(helmet);
  await app.register(rateLimit, {
    max: config.rateLimitPerMinute,
    timeWindow: '1 minute',
  });

  registerAuth(app, {
    issuer: config.issuer,
    audience: config.audience,
    adminRoles: config.adminRoles,
    rolesClaimPath: config.rolesClaimPath,
    keyResolver: deps.keyResolver,
    fetch: deps.fetch,
  });

  healthRoutes(app, { checkDatabase: deps.checkDatabase });
  templateRoutes(app, deps.templates);
  employeeRoutes(app, { identityFor: deps.identityFor });
  onboardingRoutes(app, {
    identityFor: deps.identityFor,
    audit: deps.audit,
    clock: deps.clock ?? (() => new Date()),
    generatePassword: deps.generatePassword ?? generateTemporaryPassword,
    superAdminRole: config.superAdminRole,
  });

  return app;
}
