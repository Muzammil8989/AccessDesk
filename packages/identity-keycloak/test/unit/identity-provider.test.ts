import { IdentityProviderError } from '@accessdesk/identity';
import { describe, expect, it } from 'vitest';
import { SUBJECT_ID, call, jsonResponse, setup } from '../helpers/mock-fetch';

describe('identity provider mapping', () => {
  it('maps a user to the neutral shape, with null for missing optional fields', async () => {
    const { provider } = setup(
      jsonResponse([{ id: SUBJECT_ID, username: 'ann', extra: 'dropped' }]),
      jsonResponse(1),
    );

    expect(await provider.listUsersPage()).toEqual({
      users: [
        {
          subjectId: SUBJECT_ID,
          username: 'ann',
          email: null,
          firstName: null,
          lastName: null,
          enabled: true,
          emailVerified: false,
          createdAt: null,
        },
      ],
      total: 1,
      capped: false,
    });
  });

  it('keeps the fields the provider does send', async () => {
    const { provider } = setup(
      jsonResponse({
        id: SUBJECT_ID,
        username: 'ann',
        email: 'ann@example.com',
        firstName: 'Ann',
        lastName: 'Lee',
        enabled: false,
        emailVerified: true,
      }),
    );

    expect(await provider.getUser(SUBJECT_ID)).toMatchObject({
      email: 'ann@example.com',
      firstName: 'Ann',
      lastName: 'Lee',
      enabled: false,
      emailVerified: true,
    });
  });

  it('turns the creation timestamp into a Date, and a missing or zero one into null', async () => {
    const created = Date.UTC(2024, 0, 15, 12, 0, 0);
    const { provider } = setup(
      jsonResponse({ id: SUBJECT_ID, username: 'ann', createdTimestamp: created }),
      jsonResponse({ id: SUBJECT_ID, username: 'ann', createdTimestamp: 0 }),
    );

    expect((await provider.getUser(SUBJECT_ID)).createdAt).toEqual(new Date(created));
    expect((await provider.getUser(SUBJECT_ID)).createdAt).toBeNull();
  });

  it('maps groups and roles, keeping provider IDs for roles out of the result', async () => {
    const { provider } = setup(
      jsonResponse([{ id: 'g1', name: 'Engineering', path: '/Engineering' }]),
      jsonResponse([{ id: 'r1', name: 'developer', description: 'Writes code' }]),
    );

    expect(await provider.getUserGroups(SUBJECT_ID)).toEqual([
      { id: 'g1', name: 'Engineering', path: '/Engineering' },
    ]);
    expect(await provider.getUserRoles(SUBJECT_ID)).toEqual([
      { name: 'developer', description: 'Writes code', builtin: false },
    ]);
  });

  it('marks the roles the realm creates for itself as built in, and no others', async () => {
    const names = [
      'offline_access',
      'uma_authorization',
      'default-roles-company platform',
      'Default-Roles-Company Platform',
      'default-roles-another-realm',
      'developer',
    ];
    const { provider } = setup(jsonResponse(names.map((name, i) => ({ id: `r${i}`, name }))));

    const roles = await provider.getUserRoles(SUBJECT_ID);

    expect(roles.map((role) => [role.name, role.builtin])).toEqual([
      ['offline_access', true],
      ['uma_authorization', true],
      ['default-roles-company platform', true],
      ['Default-Roles-Company Platform', true],
      ['default-roles-another-realm', false],
      ['developer', false],
    ]);
  });

  it('passes list parameters straight through', async () => {
    const { provider, fetchMock } = setup(jsonResponse([]), jsonResponse(0));

    await provider.listUsersPage({ search: 'ann', first: 20, max: 10 });

    expect(call(fetchMock, 0).url).toContain('search=ann&first=20&max=10');
    expect(call(fetchMock, 1).url).toContain('/count?search=ann');
  });

  it('sorts group members by username before paging, whatever order the provider sent', async () => {
    const member = (username: string) => ({ id: username, username, enabled: true });
    const { provider } = setup(jsonResponse([member('cy'), member('ann'), member('bob')]));

    const page = await provider.listUsersPage({ groupId: 'g1', first: 1, max: 2 });

    expect(page.users.map((u) => u.username)).toEqual(['bob', 'cy']);
    expect(page.total).toBe(3);
  });

  it('reports failures as IdentityProviderError, without the token', async () => {
    const { provider } = setup(jsonResponse({ errorMessage: 'User not found' }, { status: 404 }));

    const error = await provider.getUser(SUBJECT_ID).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(IdentityProviderError);
    expect((error as IdentityProviderError).status).toBe(404);
    expect((error as IdentityProviderError).message).toBe(
      'Identity provider request failed (404): User not found',
    );
    expect((error as IdentityProviderError).message).not.toContain('admin-token');
  });

  it('survives an error answer that is not JSON', async () => {
    const bad = () => new Response('Bad Gateway', { status: 502, statusText: 'Bad Gateway' });
    const { provider } = setup(bad(), bad());
    await expect(provider.listUsersPage()).rejects.toMatchObject({ status: 502 });
  });

  it('fails when the provider does not say where the new user is', async () => {
    const { provider } = setup(new Response(null, { status: 201 }));
    await expect(provider.createUser({ username: 'ann' })).rejects.toMatchObject({ status: 502 });
  });
});
