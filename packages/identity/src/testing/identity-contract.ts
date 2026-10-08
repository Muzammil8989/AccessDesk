import { describe, expect, it } from 'vitest';
import { IdentityProviderError, type IdentityProvider } from '../identity';

export interface IdentityContractFixture {
  provider: IdentityProvider;
  seedGroup(name: string): Promise<string>;
  seedRole(name: string): Promise<void>;
}

const MISSING_SUBJECT_ID = '00000000-0000-4000-8000-0000000000ff';

export function runIdentityProviderContract(
  label: string,
  create: () => IdentityContractFixture | Promise<IdentityContractFixture>,
): void {
  describe(`IdentityProvider contract: ${label}`, () => {
    describe('users', () => {
      it('creates an enabled user and reads it back in the neutral shape', async () => {
        const { provider } = await create();
        const subjectId = await provider.createUser({
          username: 'ann',
          email: 'ann@example.com',
          firstName: 'Ann',
          lastName: 'Lee',
        });

        expect(subjectId).toEqual(expect.any(String));
        expect(await provider.getUser(subjectId)).toMatchObject({
          subjectId,
          username: 'ann',
          email: 'ann@example.com',
          firstName: 'Ann',
          lastName: 'Lee',
          enabled: true,
        });
      });

      it('reports missing optional fields as null, never undefined', async () => {
        const { provider } = await create();
        const bare = await provider.getUser(await provider.createUser({ username: 'bare' }));

        expect(bare).toMatchObject({ email: null, firstName: null, lastName: null });
        expect(bare.emailVerified).toBe(false);
        expect(bare.createdAt === null || bare.createdAt instanceof Date).toBe(true);
      });

      it('fails with a 404 IdentityProviderError for a user that does not exist', async () => {
        const { provider } = await create();
        const error = await provider.getUser(MISSING_SUBJECT_ID).catch((e: unknown) => e);

        expect(error).toBeInstanceOf(IdentityProviderError);
        expect((error as IdentityProviderError).status).toBe(404);
      });

      it('searches, pages and counts', async () => {
        const { provider } = await create();
        const subjectIds = await Promise.all(
          ['ann', 'bob', 'anna-marie'].map((username) => provider.createUser({ username })),
        );

        expect(await provider.countUsers()).toBe(3);
        expect(await provider.countUsers({ search: 'ann' })).toBe(2);
        const found = await provider.listUsers({ search: 'ann' });
        expect(found.map((u) => u.username).sort()).toEqual(['ann', 'anna-marie']);
        expect(await provider.countUsers({ search: 'zzz' })).toBe(0);
        expect(await provider.listUsers({ search: 'zzz' })).toEqual([]);

        const first = await provider.listUsers({ first: 0, max: 2 });
        const second = await provider.listUsers({ first: 2, max: 2 });
        expect([first.length, second.length]).toEqual([2, 1]);
        expect([...first, ...second].map((u) => u.subjectId).sort()).toEqual(
          [...subjectIds].sort(),
        );
      });

      it('creates a user with a verified email and a temporary initial password', async () => {
        const { provider } = await create();
        const subjectId = await provider.createUser({
          username: 'ann',
          email: 'ann@example.com',
          emailVerified: true,
          initialPassword: { value: 'Temp-pass-123', temporary: true },
        });

        expect(await provider.getUser(subjectId)).toMatchObject({
          username: 'ann',
          emailVerified: true,
          enabled: true,
        });
      });

      it('rejects a duplicate username with a 409 IdentityProviderError', async () => {
        const { provider } = await create();
        await provider.createUser({ username: 'ann', email: 'ann@example.com' });
        const error = await provider
          .createUser({ username: 'ann', email: 'other@example.com' })
          .catch((e: unknown) => e);

        expect(error).toBeInstanceOf(IdentityProviderError);
        expect((error as IdentityProviderError).status).toBe(409);
      });

      it('rejects a duplicate email with a 409 IdentityProviderError', async () => {
        const { provider } = await create();
        await provider.createUser({ username: 'ann', email: 'ann@example.com' });
        const error = await provider
          .createUser({ username: 'bob', email: 'ann@example.com' })
          .catch((e: unknown) => e);

        expect(error).toBeInstanceOf(IdentityProviderError);
        expect((error as IdentityProviderError).status).toBe(409);
      });

      it('finds users by exact username or exact email, never by a fragment', async () => {
        const { provider } = await create();
        const annId = await provider.createUser({ username: 'ann', email: 'ann@example.com' });
        await provider.createUser({ username: 'anna-marie', email: 'anna@example.com' });

        const byUsername = await provider.findUsers({ username: 'ann', exact: true });
        const byEmail = await provider.findUsers({ email: 'ann@example.com', exact: true });
        const byFragment = await provider.findUsers({ username: 'an', exact: true });
        const byMissingEmail = await provider.findUsers({
          email: 'nobody@example.com',
          exact: true,
        });

        expect(byUsername.map((u) => u.subjectId)).toEqual([annId]);
        expect(byEmail.map((u) => u.subjectId)).toEqual([annId]);
        expect(byFragment).toEqual([]);
        expect(byMissingEmail).toEqual([]);
      });

      it('disables a user without changing anything else', async () => {
        const { provider } = await create();
        const subjectId = await provider.createUser({ username: 'ann', email: 'ann@example.com' });

        await provider.disableUser(subjectId);

        expect(await provider.getUser(subjectId)).toMatchObject({
          username: 'ann',
          email: 'ann@example.com',
          enabled: false,
        });
      });

      it('ends all sessions of an existing user, and fails for a missing one', async () => {
        const { provider } = await create();
        const subjectId = await provider.createUser({ username: 'ann' });

        await expect(provider.endAllSessions(subjectId)).resolves.toBeUndefined();
        await expect(provider.endAllSessions(MISSING_SUBJECT_ID)).rejects.toBeInstanceOf(
          IdentityProviderError,
        );
      });
    });

    describe('groups', () => {
      it('lists the top-level groups with id, name and path', async () => {
        const fixture = await create();
        const engineeringId = await fixture.seedGroup('Engineering');
        const salesId = await fixture.seedGroup('Sales');

        const listed = await fixture.provider.listGroups();

        expect([...listed].sort((a, b) => a.name.localeCompare(b.name))).toEqual([
          { id: engineeringId, name: 'Engineering', path: '/Engineering' },
          { id: salesId, name: 'Sales', path: '/Sales' },
        ]);
      });

      it('lists no groups when none exist', async () => {
        const { provider } = await create();

        expect(await provider.listGroups()).toEqual([]);
      });

      it('adds a user to a group and removes them again', async () => {
        const fixture = await create();
        const { provider } = fixture;
        const subjectId = await provider.createUser({ username: 'ann' });
        const groupId = await fixture.seedGroup('Engineering');

        expect(await provider.getUserGroups(subjectId)).toEqual([]);

        await provider.addUserToGroup(subjectId, groupId);
        expect(await provider.getUserGroups(subjectId)).toEqual([
          { id: groupId, name: 'Engineering', path: '/Engineering' },
        ]);

        await provider.removeUserFromGroup(subjectId, groupId);
        expect(await provider.getUserGroups(subjectId)).toEqual([]);
      });

      it('fails with an IdentityProviderError for a user that does not exist', async () => {
        const fixture = await create();
        const groupId = await fixture.seedGroup('Engineering');

        await expect(fixture.provider.getUserGroups(MISSING_SUBJECT_ID)).rejects.toBeInstanceOf(
          IdentityProviderError,
        );
        await expect(
          fixture.provider.addUserToGroup(MISSING_SUBJECT_ID, groupId),
        ).rejects.toBeInstanceOf(IdentityProviderError);
      });
    });

    describe('roles', () => {
      it('adds and removes roles by name', async () => {
        const fixture = await create();
        const { provider } = fixture;
        const subjectId = await provider.createUser({ username: 'ann' });
        await fixture.seedRole('developer');
        await fixture.seedRole('sales');

        expect(await provider.getUserRoles(subjectId)).toEqual([]);

        await provider.addUserRoles(subjectId, ['developer', 'sales']);
        const assigned = await provider.getUserRoles(subjectId);
        expect(assigned.map((r) => r.name).sort()).toEqual(['developer', 'sales']);
        for (const role of assigned) expect(role.description).toBeNull();

        await provider.removeUserRoles(subjectId, ['developer']);
        expect((await provider.getUserRoles(subjectId)).map((r) => r.name)).toEqual(['sales']);
      });

      it('fails with a 404 IdentityProviderError for a role that does not exist', async () => {
        const { provider } = await create();
        const subjectId = await provider.createUser({ username: 'ann' });
        const error = await provider
          .addUserRoles(subjectId, ['no-such-role'])
          .catch((e: unknown) => e);

        expect(error).toBeInstanceOf(IdentityProviderError);
        expect((error as IdentityProviderError).status).toBe(404);
      });
    });
  });
}
