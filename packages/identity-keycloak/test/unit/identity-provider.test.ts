import { IdentityProviderError } from '@accessdesk/identity';
import { describe, expect, it } from 'vitest';
import { SUBJECT_ID, call, jsonResponse, setup } from '../helpers/mock-fetch';

describe('identity provider mapping', () => {
  it('maps a user to the neutral shape, with null for missing optional fields', async () => {
    const { provider } = setup(
      jsonResponse([{ id: SUBJECT_ID, username: 'ann', extra: 'dropped' }]),
    );

    expect(await provider.listUsers()).toEqual([
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
    ]);
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
      { name: 'developer', description: 'Writes code' },
    ]);
  });

  it('passes list parameters straight through', async () => {
    const { provider, fetchMock } = setup(jsonResponse([]), jsonResponse(0));

    await provider.listUsers({ search: 'ann', first: 20, max: 10 });
    await provider.countUsers({ search: 'ann' });

    expect(call(fetchMock, 0).url).toContain('search=ann&first=20&max=10');
    expect(call(fetchMock, 1).url).toContain('/count?search=ann');
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
    const { provider } = setup(
      new Response('Bad Gateway', { status: 502, statusText: 'Bad Gateway' }),
    );
    await expect(provider.listUsers()).rejects.toMatchObject({ status: 502 });
  });

  it('fails when the provider does not say where the new user is', async () => {
    const { provider } = setup(new Response(null, { status: 201 }));
    await expect(provider.createUser({ username: 'ann' })).rejects.toMatchObject({ status: 502 });
  });
});
