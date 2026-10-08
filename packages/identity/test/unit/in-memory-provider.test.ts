import { describe, expect, it } from 'vitest';
import { IdentityProviderError } from '../../src/index';
import {
  createInMemoryIdentityProvider,
  runIdentityProviderContract,
} from '../../src/testing/index';

runIdentityProviderContract('in-memory provider', () => {
  const fake = createInMemoryIdentityProvider();
  return {
    provider: fake.provider,
    seedGroup: async (name) => fake.seedGroup(name),
    seedRole: async (name) => fake.seedRole(name),
  };
});

describe('in-memory provider test controls', () => {
  it('fails the next call of a method once, then behaves normally', async () => {
    const fake = createInMemoryIdentityProvider();
    fake.failNext('listGroups', new IdentityProviderError(503, 'down'));

    await expect(fake.provider.listGroups()).rejects.toMatchObject({ status: 503 });
    await expect(fake.provider.listGroups()).resolves.toEqual([]);
    expect(fake.callCount('listGroups')).toBe(2);
  });

  it('fails a method several times and can clear armed failures', async () => {
    const fake = createInMemoryIdentityProvider();
    fake.failNext('listGroups', new IdentityProviderError(500, 'x'), 2);

    await expect(fake.provider.listGroups()).rejects.toBeInstanceOf(IdentityProviderError);
    await expect(fake.provider.listGroups()).rejects.toBeInstanceOf(IdentityProviderError);
    await expect(fake.provider.listGroups()).resolves.toEqual([]);

    fake.failNext('listGroups', new IdentityProviderError(500, 'x'), 5);
    fake.clearFailures();
    await expect(fake.provider.listGroups()).resolves.toEqual([]);
  });

  it('exposes what was stored for a user, and nothing for an unknown one', async () => {
    const fake = createInMemoryIdentityProvider();
    const groupId = fake.seedGroup('Sales');
    fake.seedRole('member');
    const subjectId = await fake.provider.createUser({
      username: 'Ann',
      initialPassword: { value: 'Temp-pass-123', temporary: true },
    });
    await fake.provider.addUserToGroup(subjectId, groupId);
    await fake.provider.addUserRoles(subjectId, ['member']);

    expect(fake.inspect(subjectId)).toEqual({
      groupIds: [groupId],
      roleNames: ['member'],
      initialPassword: { value: 'Temp-pass-123', temporary: true },
    });
    expect(fake.inspect('00000000-0000-4000-8000-0000000000ff')).toBeUndefined();
  });

  it('keeps usernames and emails case-insensitively unique', async () => {
    const fake = createInMemoryIdentityProvider();
    await fake.provider.createUser({ username: 'Ann', email: 'Ann@Example.com' });

    await expect(fake.provider.createUser({ username: 'ann' })).rejects.toMatchObject({
      status: 409,
    });
    await expect(
      fake.provider.createUser({ username: 'bob', email: 'ann@example.com' }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it('rejects group and role operations that name something unknown', async () => {
    const fake = createInMemoryIdentityProvider();
    const subjectId = await fake.provider.createUser({ username: 'ann' });

    await expect(fake.provider.addUserToGroup(subjectId, 'no-such-group')).rejects.toMatchObject({
      status: 404,
    });
    await expect(fake.provider.removeUserRoles(subjectId, ['no-such-role'])).rejects.toMatchObject({
      status: 404,
    });
  });
});
