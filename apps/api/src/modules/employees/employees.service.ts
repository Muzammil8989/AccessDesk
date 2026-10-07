import type { IdentityProvider } from '@accessdesk/identity';
import type { Employee, EmployeeList, ListEmployeesQuery } from '@accessdesk/shared';
import { toEmployee } from './employees.mapper';

export class EmployeesService {
  constructor(private readonly identity: IdentityProvider) {}

  async list({ search, first, max }: ListEmployeesQuery): Promise<EmployeeList> {
    const [users, total] = await Promise.all([
      this.identity.listUsers({ search, first, max }),
      this.identity.countUsers({ search }),
    ]);
    return { items: users.map(toEmployee), total, first, max };
  }

  async get(id: string): Promise<Employee> {
    return toEmployee(await this.identity.getUser(id));
  }
}
