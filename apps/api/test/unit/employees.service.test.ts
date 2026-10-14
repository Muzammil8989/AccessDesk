import { IdentityProviderError, type IdentityProvider } from '@accessdesk/identity';
import { createInMemoryIdentityProvider } from '@accessdesk/identity/testing';
import { describe, expect, it, vi } from 'vitest';
import { EmployeesService } from '../../src/modules/employees/employees.service';

async function seeded(options: { memberFilterCap?: number } = {}) {
  const fake = createInMemoryIdentityProvider(options);
  const engineering = fake.seedGroup('Engineering');
  const sales = fake.seedGroup('Sales');
  fake.seedRole('developer');
  fake.seedRole('manager');
  fake.seedRole('offline_access', { builtin: true });

  const ids: Record<string, string> = {};
  for (const username of ['ann', 'anna-marie', 'bob', 'cy']) {
    ids[username] = await fake.provider.createUser({ username });
  }
  await fake.provider.addUserToGroup(ids.ann!, engineering);
  await fake.provider.addUserToGroup(ids.bob!, engineering);
  await fake.provider.addUserToGroup(ids.cy!, sales);
  await fake.provider.addUserRoles(ids.ann!, ['developer']);
  await fake.provider.addUserRoles(ids['anna-marie']!, ['developer']);
  await fake.provider.disableUser(ids.bob!);
  return { fake, service: new EmployeesService(fake.provider), engineering, sales, ids };
}

const usernames = (list: { items: { username: string }[] }) => list.items.map((e) => e.username);

describe('EmployeesService', () => {
  describe('list', () => {
    it('lists employees with the total and without a cap notice', async () => {
      const { service } = await seeded();

      const result = await service.list({ first: 0, max: 2 });

      expect(usernames(result)).toEqual(['ann', 'anna-marie']);
      expect(result).toMatchObject({ total: 4, capped: false, first: 0, max: 2 });
    });

    it('returns an empty page without failing', async () => {
      const fake = createInMemoryIdentityProvider();

      expect(await new EmployeesService(fake.provider).list({ first: 0, max: 20 })).toEqual({
        items: [],
        total: 0,
        capped: false,
        first: 0,
        max: 20,
      });
    });

    it('filters by enabled, and by enabled together with search', async () => {
      const { service } = await seeded();

      const disabled = await service.list({ enabled: false, first: 0, max: 20 });
      const searched = await service.list({ search: 'ann', enabled: true, first: 0, max: 20 });

      expect(usernames(disabled)).toEqual(['bob']);
      expect(disabled.total).toBe(1);
      expect(usernames(searched)).toEqual(['ann', 'anna-marie']);
    });

    it('filters by a top-level group, with the other filters applied to its members', async () => {
      const { service, engineering } = await seeded();

      const everyone = await service.list({ groupId: engineering, first: 0, max: 20 });
      const active = await service.list({
        groupId: engineering,
        enabled: true,
        first: 0,
        max: 20,
      });

      expect(usernames(everyone)).toEqual(['ann', 'bob']);
      expect(usernames(active)).toEqual(['ann']);
      expect(active.total).toBe(1);
    });

    it('filters by a realm role', async () => {
      const { service } = await seeded();

      const result = await service.list({ role: 'developer', search: 'anna', first: 0, max: 20 });

      expect(usernames(result)).toEqual(['anna-marie']);
    });

    it('accepts a built-in role as a filter value, since it is a real role', async () => {
      const { service } = await seeded();

      expect((await service.list({ role: 'offline_access', first: 0, max: 20 })).total).toBe(0);
    });

    it('passes the cap notice on and keeps total to what was actually read', async () => {
      const { service, engineering } = await seeded({ memberFilterCap: 1 });

      const result = await service.list({ groupId: engineering, first: 0, max: 20 });

      expect(result).toMatchObject({ total: 1, capped: true });
      expect(usernames(result)).toEqual(['ann']);
    });

    it('refuses a group that does not exist, before reading any members', async () => {
      const { service, fake } = await seeded();

      const error = await service
        .list({ groupId: 'no-such-group', first: 0, max: 20 })
        .catch((e: unknown) => e);

      expect(error).toMatchObject({ statusCode: 400, code: 'unknown_group' });
      expect(fake.callCount('listUsersPage')).toBe(0);
    });

    it('refuses a role that does not exist, before reading any holders', async () => {
      const { service, fake } = await seeded();

      const error = await service
        .list({ role: 'no-such-role', first: 0, max: 20 })
        .catch((e: unknown) => e);

      expect(error).toMatchObject({ statusCode: 400, code: 'unknown_role' });
      expect(fake.callCount('listUsersPage')).toBe(0);
    });

    it('does not look up groups or roles for a plain list', async () => {
      const { service, fake } = await seeded();

      await service.list({ search: 'ann', first: 0, max: 20 });

      expect(fake.callCount('listGroups')).toBe(0);
      expect(fake.callCount('listRoles')).toBe(0);
    });

    it('lets identity provider errors propagate so the HTTP layer can map them', async () => {
      const fake = createInMemoryIdentityProvider();
      const boom = new IdentityProviderError(503, 'down');
      fake.failNext('listUsersPage', boom);

      await expect(new EmployeesService(fake.provider).list({ first: 0, max: 20 })).rejects.toBe(
        boom,
      );
    });

    it('lets a failing group lookup propagate too', async () => {
      const { service, fake, engineering } = await seeded();
      const boom = new IdentityProviderError(500, 'down');
      fake.failNext('listGroups', boom);

      await expect(service.list({ groupId: engineering, first: 0, max: 20 })).rejects.toBe(boom);
    });
  });

  describe('filterOptions', () => {
    it('lists top-level groups and non-built-in roles by name, without anything else', async () => {
      const { service, engineering, sales } = await seeded();

      expect(await service.filterOptions()).toEqual({
        groups: [
          { id: engineering, name: 'Engineering' },
          { id: sales, name: 'Sales' },
        ],
        roles: [{ name: 'developer' }, { name: 'manager' }],
      });
    });
  });

  describe('get', () => {
    it('gets one employee as the app view, with no extra provider fields', async () => {
      const { service, ids } = await seeded();

      const employee = await service.get(ids.ann!);

      expect(Object.keys(employee).sort()).toEqual(
        [
          'createdAt',
          'email',
          'emailVerified',
          'enabled',
          'firstName',
          'id',
          'lastName',
          'username',
        ].sort(),
      );
    });

    it('asks the provider for exactly that employee', async () => {
      const getUser = vi.fn().mockRejectedValue(new IdentityProviderError(404, 'nope'));
      const service = new EmployeesService({ getUser } as unknown as IdentityProvider);

      await expect(service.get('abc')).rejects.toMatchObject({ status: 404 });
      expect(getUser).toHaveBeenCalledWith('abc');
    });
  });
});
