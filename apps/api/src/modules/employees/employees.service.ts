import type { IdentityProvider } from '@accessdesk/identity';
import type {
  Employee,
  EmployeeFilterOptions,
  EmployeeList,
  ListEmployeesQuery,
} from '@accessdesk/shared';
import { AppError } from '../../errors';
import { toEmployee } from './employees.mapper';

const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);

export class EmployeesService {
  constructor(private readonly identity: IdentityProvider) {}

  async list({
    search,
    enabled,
    groupId,
    role,
    first,
    max,
  }: ListEmployeesQuery): Promise<EmployeeList> {
    // Checked here so a typo or a subgroup id gets a clear message, not a silent empty list.
    if (groupId !== undefined) await this.assertTopLevelGroup(groupId);
    if (role !== undefined) await this.assertRole(role);

    const page = await this.identity.listUsersPage({ search, enabled, groupId, role, first, max });
    return {
      items: page.users.map(toEmployee),
      total: page.total,
      capped: page.capped,
      first,
      max,
    };
  }

  async get(id: string): Promise<Employee> {
    return toEmployee(await this.identity.getUser(id));
  }

  async filterOptions(): Promise<EmployeeFilterOptions> {
    const [groups, roles] = await Promise.all([
      this.identity.listGroups(),
      this.identity.listRoles(),
    ]);
    return {
      groups: groups.map(({ id, name }) => ({ id, name })).sort(byName),
      roles: roles
        .filter((role) => !role.builtin)
        .map(({ name }) => ({ name }))
        .sort(byName),
    };
  }

  private async assertTopLevelGroup(groupId: string): Promise<void> {
    const groups = await this.identity.listGroups();
    if (!groups.some((group) => group.id === groupId)) {
      throw new AppError(
        400,
        'unknown_group',
        'That group does not exist, or it is not a top-level group',
      );
    }
  }

  private async assertRole(name: string): Promise<void> {
    const roles = await this.identity.listRoles();
    if (!roles.some((role) => role.name === name)) {
      throw new AppError(400, 'unknown_role', 'That role does not exist');
    }
  }
}
