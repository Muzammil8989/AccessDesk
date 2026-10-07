import {
  employeeIdParamsSchema,
  listEmployeesQuerySchema,
  type Employee,
  type EmployeeList,
} from '@accessdesk/shared';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { IdentityProviderFactory } from '../../infra/identity';
import { requireAuth } from '../../plugins/auth';
import { EmployeesService } from './employees.service';

export interface EmployeeRouteDeps {
  identityFor: IdentityProviderFactory;
}

export function employeeRoutes(app: FastifyInstance, deps: EmployeeRouteDeps): void {
  const serviceFor = (request: FastifyRequest) =>
    new EmployeesService(deps.identityFor(requireAuth(request).token));

  app.get('/employees', async (request): Promise<EmployeeList> => {
    return serviceFor(request).list(listEmployeesQuerySchema.parse(request.query));
  });

  app.get('/employees/:id', async (request): Promise<Employee> => {
    const { id } = employeeIdParamsSchema.parse(request.params);
    return serviceFor(request).get(id);
  });
}
