import {
  employeeIdParamsSchema,
  listEmployeesQuerySchema,
  type Employee,
  type EmployeeList,
} from '@accessdesk/shared';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { KeycloakClientFactory } from '../../infra/keycloak';
import { requireAuth } from '../../plugins/auth';
import { EmployeesService } from './employees.service';

export interface EmployeeRouteDeps {
  keycloakFor: KeycloakClientFactory;
}

export function employeeRoutes(app: FastifyInstance, deps: EmployeeRouteDeps): void {
  const serviceFor = (request: FastifyRequest) =>
    new EmployeesService(deps.keycloakFor(requireAuth(request).token));

  app.get('/employees', async (request): Promise<EmployeeList> => {
    return serviceFor(request).list(listEmployeesQuerySchema.parse(request.query));
  });

  app.get('/employees/:id', async (request): Promise<Employee> => {
    const { id } = employeeIdParamsSchema.parse(request.params);
    return serviceFor(request).get(id);
  });
}
