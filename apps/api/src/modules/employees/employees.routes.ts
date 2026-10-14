import {
  employeeIdParamsSchema,
  listEmployeesQuerySchema,
  type Employee,
  type EmployeeFilterOptions,
  type EmployeeList,
} from '@accessdesk/shared';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { IdentityProviderFactory } from '../../infra/identity';
import { requireAuth } from '../../plugins/auth';
import { EmployeesService } from './employees.service';

// The list is searched as the admin types (one request per 300 ms pause, so at most about
// 200 a minute), so the plain limit sits above that and typing never meets a 429. A group or
// role filter makes the adapter read every member, up to the cap, for each request: it gets a
// lower limit, counted on its own so plain searching is never held back by it.
export const EMPLOYEES_RATE_LIMIT = {
  plainPerMinute: 240,
  filteredPerMinute: 90,
} as const;

export interface EmployeeRouteDeps {
  identityFor: IdentityProviderFactory;
  // The API-wide limit. Neither number above may exceed it.
  rateLimitPerMinute: number;
}

function isFiltered(request: FastifyRequest): boolean {
  const { groupId, role } = request.query as Record<string, unknown>;
  return (
    (typeof groupId === 'string' && groupId !== '') || (typeof role === 'string' && role !== '')
  );
}

export function employeeRoutes(app: FastifyInstance, deps: EmployeeRouteDeps): void {
  const serviceFor = (request: FastifyRequest) =>
    new EmployeesService(deps.identityFor(requireAuth(request).token));

  const plainLimit = Math.min(EMPLOYEES_RATE_LIMIT.plainPerMinute, deps.rateLimitPerMinute);
  const filteredLimit = Math.min(EMPLOYEES_RATE_LIMIT.filteredPerMinute, deps.rateLimitPerMinute);

  const plain = { max: plainLimit, timeWindow: '1 minute' } as const;
  const listLimit = {
    max: (request: FastifyRequest) => (isFiltered(request) ? filteredLimit : plainLimit),
    timeWindow: '1 minute',
    keyGenerator: (request: FastifyRequest) =>
      `${request.ip}:${isFiltered(request) ? 'filtered' : 'plain'}`,
  } as const;

  void app.register(async (scope) => {
    // Names and emails are personal data: nothing here may be cached.
    scope.addHook('onSend', async (_request, reply) => {
      reply.header('cache-control', 'no-store');
    });

    scope.get(
      '/employees',
      { config: { rateLimit: listLimit } },
      async (request): Promise<EmployeeList> => {
        return serviceFor(request).list(listEmployeesQuerySchema.parse(request.query));
      },
    );

    // A fixed path. It cannot clash with /employees/:id, whose id must be a UUID.
    scope.get(
      '/employees/filter-options',
      { config: { rateLimit: plain } },
      async (request): Promise<EmployeeFilterOptions> => serviceFor(request).filterOptions(),
    );

    scope.get(
      '/employees/:id',
      { config: { rateLimit: plain } },
      async (request): Promise<Employee> => {
        const { id } = employeeIdParamsSchema.parse(request.params);
        return serviceFor(request).get(id);
      },
    );
  });
}
