import type { IdentityProvider, IdentityUser } from '@accessdesk/identity';
import { describe, expect, it, vi } from 'vitest';
import { EmployeesService } from '../../src/modules/employees/employees.service';

const user = (n: number): IdentityUser => ({
  subjectId: `00000000-0000-4000-8000-00000000000${n}`,
  username: `user${n}`,
  email: null,
  firstName: null,
  lastName: null,
  enabled: true,
  emailVerified: false,
  createdAt: null,
});

function fakeIdentity(overrides: Partial<IdentityProvider> = {}): IdentityProvider {
  return {
    listUsers: vi.fn().mockResolvedValue([user(1), user(2)]),
    countUsers: vi.fn().mockResolvedValue(42),
    getUser: vi.fn().mockResolvedValue(user(1)),
    ...overrides,
  } as unknown as IdentityProvider;
}

describe('EmployeesService', () => {
  it('lists employees with the total, using the same search for both calls', async () => {
    const identity = fakeIdentity();
    const result = await new EmployeesService(identity).list({ search: 'ann', first: 20, max: 10 });

    expect(identity.listUsers).toHaveBeenCalledWith({ search: 'ann', first: 20, max: 10 });
    expect(identity.countUsers).toHaveBeenCalledWith({ search: 'ann' });
    expect(result).toMatchObject({ total: 42, first: 20, max: 10 });
    expect(result.items.map((e) => e.username)).toEqual(['user1', 'user2']);
  });

  it('returns an empty page without failing', async () => {
    const identity = fakeIdentity({
      listUsers: vi.fn().mockResolvedValue([]),
      countUsers: vi.fn().mockResolvedValue(0),
    });
    expect(await new EmployeesService(identity).list({ first: 0, max: 20 })).toEqual({
      items: [],
      total: 0,
      first: 0,
      max: 20,
    });
  });

  it('lets identity provider errors propagate so the HTTP layer can map them', async () => {
    const boom = new Error('identity provider down');
    const identity = fakeIdentity({ listUsers: vi.fn().mockRejectedValue(boom) });
    await expect(new EmployeesService(identity).list({ first: 0, max: 20 })).rejects.toBe(boom);
  });

  it('gets one employee as the app view, with no extra provider fields', async () => {
    const employee = await new EmployeesService(fakeIdentity()).get(user(1).subjectId);
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
