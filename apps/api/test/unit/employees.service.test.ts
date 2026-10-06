import type { KeycloakClient } from '@accessdesk/keycloak-client';
import { describe, expect, it, vi } from 'vitest';
import { EmployeesService } from '../../src/modules/employees/employees.service';

const user = (n: number) => ({
  id: `00000000-0000-4000-8000-00000000000${n}`,
  username: `user${n}`,
  enabled: true,
  emailVerified: false,
});

function fakeKeycloak(overrides: Partial<KeycloakClient> = {}): KeycloakClient {
  return {
    listUsers: vi.fn().mockResolvedValue([user(1), user(2)]),
    countUsers: vi.fn().mockResolvedValue(42),
    getUser: vi.fn().mockResolvedValue(user(1)),
    ...overrides,
  } as unknown as KeycloakClient;
}

describe('EmployeesService', () => {
  it('lists employees with the total, using the same search for both calls', async () => {
    const keycloak = fakeKeycloak();
    const result = await new EmployeesService(keycloak).list({ search: 'ann', first: 20, max: 10 });

    expect(keycloak.listUsers).toHaveBeenCalledWith({ search: 'ann', first: 20, max: 10 });
    expect(keycloak.countUsers).toHaveBeenCalledWith({ search: 'ann' });
    expect(result).toMatchObject({ total: 42, first: 20, max: 10 });
    expect(result.items.map((e) => e.username)).toEqual(['user1', 'user2']);
  });

  it('returns an empty page without failing', async () => {
    const keycloak = fakeKeycloak({
      listUsers: vi.fn().mockResolvedValue([]),
      countUsers: vi.fn().mockResolvedValue(0),
    });
    expect(await new EmployeesService(keycloak).list({ first: 0, max: 20 })).toEqual({
      items: [],
      total: 0,
      first: 0,
      max: 20,
    });
  });

  it('lets Keycloak errors propagate so the HTTP layer can map them', async () => {
    const boom = new Error('keycloak down');
    const keycloak = fakeKeycloak({ listUsers: vi.fn().mockRejectedValue(boom) });
    await expect(new EmployeesService(keycloak).list({ first: 0, max: 20 })).rejects.toBe(boom);
  });

  it('gets one employee as the app view, with no extra Keycloak fields', async () => {
    const employee = await new EmployeesService(fakeKeycloak()).get(user(1).id);
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
});
