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

        expect(await provider.listUsersPage()).toMatchObject({ total: 3, capped: false });
        const found = await provider.listUsersPage({ search: 'ann' });
        expect(found.total).toBe(2);
        expect(found.users.map((u) => u.username).sort()).toEqual(['ann', 'anna-marie']);
        expect(await provider.listUsersPage({ search: 'zzz' })).toEqual({
          users: [],
          total: 0,
          capped: false,
        });

        const first = await provider.listUsersPage({ first: 0, max: 2 });
        const second = await provider.listUsersPage({ first: 2, max: 2 });
        expect([first.users.length, second.users.length]).toEqual([2, 1]);
        expect([first.total, second.total]).toEqual([3, 3]);
        expect([...first.users, ...second.users].map((u) => u.subjectId).sort()).toEqual(
          [...subjectIds].sort(),
        );
      });

      it('searches by the start of a name or email, ignoring case, not by a fragment', async () => {
        const { provider } = await create();
        await provider.createUser({
          username: 'ann',
          email: 'ann@example.com',
          firstName: 'Annabel',
          lastName: 'Marie',
        });
        await provider.createUser({ username: 'bob', email: 'bob@example.com' });

        const total = async (search: string) => (await provider.listUsersPage({ search })).total;

        expect(await total('ANN')).toBe(1);
        expect(await total('annabel')).toBe(1);
        expect(await total('mar')).toBe(1);
        expect(await total('bob@ex')).toBe(1);
        expect(await total('nabel')).toBe(0);
        expect(await total('example.com')).toBe(0);
      });

      it('searches the same way with and without a group filter', async () => {
        const fixture = await create();
        const { provider } = fixture;
        const groupId = await fixture.seedGroup('Engineering');
        const id = await provider.createUser({ username: 'ann', firstName: 'Annabel' });
        await provider.addUserToGroup(id, groupId);

        for (const search of ['ann', 'ANNA', 'nabel', 'bel']) {
          const plain = await provider.listUsersPage({ search });
          const inGroup = await provider.listUsersPage({ groupId, search });
          expect(inGroup.users.map((u) => u.subjectId)).toEqual(
            plain.users.map((u) => u.subjectId),
          );
        }
      });

      it('filters by enabled and keeps the total in step with the filter', async () => {
        const { provider } = await create();
        const annId = await provider.createUser({ username: 'ann' });
        await provider.createUser({ username: 'anna-marie' });
        await provider.createUser({ username: 'bob' });
        await provider.disableUser(annId);

        const enabled = await provider.listUsersPage({ enabled: true });
        const disabled = await provider.listUsersPage({ enabled: false });

        expect(enabled.users.map((u) => u.username).sort()).toEqual(['anna-marie', 'bob']);
        expect(enabled.total).toBe(2);
        expect(disabled.users.map((u) => u.username)).toEqual(['ann']);
        expect(disabled.total).toBe(1);
      });

      it('combines enabled with search and with paging', async () => {
        const { provider } = await create();
        const annId = await provider.createUser({ username: 'ann' });
        await provider.createUser({ username: 'anna-marie' });
        await provider.createUser({ username: 'anne' });
        await provider.createUser({ username: 'bob' });
        await provider.disableUser(annId);

        const page = await provider.listUsersPage({
          search: 'ann',
          enabled: true,
          first: 1,
          max: 1,
        });

        expect(page.total).toBe(2);
        expect(page.users.map((u) => u.username)).toEqual(['anne']);
        expect(await provider.listUsersPage({ search: 'ann', enabled: false })).toMatchObject({
          total: 1,
        });
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

      it('lists the direct members of a group, with search, enabled and paging applied', async () => {
        const fixture = await create();
        const { provider } = fixture;
        const groupId = await fixture.seedGroup('Engineering');
        const annId = await provider.createUser({ username: 'ann' });
        const annaId = await provider.createUser({ username: 'anna-marie' });
        const bobId = await provider.createUser({ username: 'bob' });
        await provider.createUser({ username: 'outsider' });
        for (const id of [annId, annaId, bobId]) await provider.addUserToGroup(id, groupId);
        await provider.disableUser(annaId);

        const everyone = await provider.listUsersPage({ groupId });
        expect(everyone.users.map((u) => u.username)).toEqual(['ann', 'anna-marie', 'bob']);
        expect(everyone).toMatchObject({ total: 3, capped: false });

        const active = await provider.listUsersPage({ groupId, enabled: true });
        expect(active.users.map((u) => u.username)).toEqual(['ann', 'bob']);
        expect(active.total).toBe(2);

        const searched = await provider.listUsersPage({ groupId, search: 'ann', enabled: true });
        expect(searched.users.map((u) => u.username)).toEqual(['ann']);
        expect(searched.total).toBe(1);

        const second = await provider.listUsersPage({ groupId, first: 1, max: 1 });
        expect(second.users.map((u) => u.username)).toEqual(['anna-marie']);
        expect(second.total).toBe(3);
      });

      it('lists no one for a group nobody belongs to', async () => {
        const fixture = await create();
        await fixture.provider.createUser({ username: 'ann' });
        const groupId = await fixture.seedGroup('Empty');

        expect(await fixture.provider.listUsersPage({ groupId })).toEqual({
          users: [],
          total: 0,
          capped: false,
        });
      });

      it('fails with a 404 IdentityProviderError when filtering by an unknown group', async () => {
        const { provider } = await create();
        const error = await provider
          .listUsersPage({ groupId: 'no-such-group' })
          .catch((e: unknown) => e);

        expect(error).toBeInstanceOf(IdentityProviderError);
        expect((error as IdentityProviderError).status).toBe(404);
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
        for (const role of assigned) {
          expect(role.description).toBeNull();
          expect(role.builtin).toBe(false);
        }

        await provider.removeUserRoles(subjectId, ['developer']);
        expect((await provider.getUserRoles(subjectId)).map((r) => r.name)).toEqual(['sales']);
      });

      it('lists the realm roles by name, and lists none when none exist', async () => {
        const fixture = await create();
        expect(await fixture.provider.listRoles()).toEqual([]);

        await fixture.seedRole('developer');
        await fixture.seedRole('sales');

        const listed = await fixture.provider.listRoles();
        expect(listed.map((role) => role.name).sort()).toEqual(['developer', 'sales']);
        for (const role of listed) {
          expect(role.description).toBeNull();
          expect(role.builtin).toBe(false);
        }
      });

      it('lists the direct holders of a role, with search, enabled and paging applied', async () => {
        const fixture = await create();
        const { provider } = fixture;
        await fixture.seedRole('developer');
        await fixture.seedRole('sales');
        const annId = await provider.createUser({ username: 'ann' });
        const annaId = await provider.createUser({ username: 'anna-marie' });
        const bobId = await provider.createUser({ username: 'bob' });
        await provider.addUserRoles(annId, ['developer']);
        await provider.addUserRoles(annaId, ['developer']);
        await provider.addUserRoles(bobId, ['sales']);
        await provider.disableUser(annaId);

        const holders = await provider.listUsersPage({ role: 'developer' });
        expect(holders.users.map((u) => u.username)).toEqual(['ann', 'anna-marie']);
        expect(holders).toMatchObject({ total: 2, capped: false });

        const active = await provider.listUsersPage({ role: 'developer', enabled: true });
        expect(active.users.map((u) => u.username)).toEqual(['ann']);
        expect(active.total).toBe(1);

        const searched = await provider.listUsersPage({ role: 'developer', search: 'anna' });
        expect(searched.users.map((u) => u.username)).toEqual(['anna-marie']);

        const second = await provider.listUsersPage({ role: 'developer', first: 1, max: 1 });
        expect(second.users.map((u) => u.username)).toEqual(['anna-marie']);
        expect(second.total).toBe(2);
      });

      it('finds the holders of a role whose name needs URL encoding', async () => {
        const fixture = await create();
        const name = 'team lead/a%b?c';
        await fixture.seedRole(name);
        const annId = await fixture.provider.createUser({ username: 'ann' });
        await fixture.provider.addUserRoles(annId, [name]);

        const page = await fixture.provider.listUsersPage({ role: name });

        expect(page.users.map((u) => u.username)).toEqual(['ann']);
      });

      it('fails with a 404 IdentityProviderError when filtering by an unknown role', async () => {
        const { provider } = await create();
        const error = await provider
          .listUsersPage({ role: 'no-such-role' })
          .catch((e: unknown) => e);

        expect(error).toBeInstanceOf(IdentityProviderError);
        expect((error as IdentityProviderError).status).toBe(404);
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
