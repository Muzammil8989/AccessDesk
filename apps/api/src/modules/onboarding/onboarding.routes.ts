import {
  onboardEmployeeSchema,
  onboardingSubjectParamsSchema,
  retryOnboardingSchema,
  type OnboardResult,
  type OnboardingOptions,
} from '@accessdesk/shared';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { IdentityProviderFactory } from '../../infra/identity';
import { requireAuth } from '../../plugins/auth';
import type { AuditRepository } from '../audit/audit.repository';
import type { ChecklistRepository } from '../checklists/checklists.repository';
import type { TemplateRepository } from '../templates/templates.repository';
import { OnboardingService, type Caller } from './onboarding.service';

export const ONBOARDING_RATE_LIMIT = {
  max: 20,
  timeWindow: '1 minute',
} as const;

const ROUTE_CONFIG = { rateLimit: ONBOARDING_RATE_LIMIT } as const;

export interface OnboardingRouteDeps {
  identityFor: IdentityProviderFactory;
  audit: AuditRepository;
  templates: TemplateRepository;
  checklists: ChecklistRepository;
  clock: () => Date;
  generatePassword: () => string;
  adminRoles: readonly string[];
  superAdminRole: string;
}

export function onboardingRoutes(app: FastifyInstance, deps: OnboardingRouteDeps): void {
  const serviceFor = (request: FastifyRequest) =>
    new OnboardingService({
      identity: deps.identityFor(requireAuth(request).token),
      audit: deps.audit,
      templates: deps.templates,
      checklists: deps.checklists,
      clock: deps.clock,
      generatePassword: deps.generatePassword,
      adminRoles: deps.adminRoles,
      superAdminRole: deps.superAdminRole,
    });

  const callerOf = (request: FastifyRequest): Caller => {
    const auth = requireAuth(request);
    return { actorId: auth.sub, roles: auth.roles, requestId: request.id, log: request.log };
  };

  void app.register(async (scope) => {
    scope.addHook('onSend', async (_request, reply) => {
      reply.header('cache-control', 'no-store');
    });

    scope.get(
      '/onboarding/options',
      { config: ROUTE_CONFIG },
      async (request): Promise<OnboardingOptions> =>
        serviceFor(request).getOptions(callerOf(request)),
    );

    scope.post(
      '/onboarding',
      { config: ROUTE_CONFIG },
      async (request, reply): Promise<OnboardResult> => {
        const input = onboardEmployeeSchema.parse(request.body);
        const result = await serviceFor(request).onboard(input, callerOf(request));
        reply.code(result.status === 'complete' ? 201 : 207);
        return result;
      },
    );

    scope.post(
      '/onboarding/:subjectId/retry',
      { config: ROUTE_CONFIG },
      async (request, reply): Promise<OnboardResult> => {
        const { subjectId } = onboardingSubjectParamsSchema.parse(request.params);
        const input = retryOnboardingSchema.parse(request.body);
        const result = await serviceFor(request).retry(subjectId, input, callerOf(request));
        reply.code(result.status === 'complete' ? 200 : 207);
        return result;
      },
    );
  });
}
