import type { Employee, EmployeeList, ListEmployeesQuery } from '@accessdesk/shared';
import type { KeycloakClient } from '@accessdesk/keycloak-client';
import { toEmployee } from './employees.mapper';

/**
 * Employee use cases. It knows nothing about HTTP or about how the Keycloak client is built:
 * it only needs something that satisfies the KeycloakClient interface.
 */
export class EmployeesService {
  constructor(private readonly keycloak: KeycloakClient) {}

  async list({ search, first, max }: ListEmployeesQuery): Promise<EmployeeList> {
    const [users, total] = await Promise.all([
      this.keycloak.listUsers({ search, first, max }),
      this.keycloak.countUsers({ search }),
    ]);
    return { items: users.map(toEmployee), total, first, max };
  }

  async get(id: string): Promise<Employee> {
    return toEmployee(await this.keycloak.getUser(id));
  }
}
