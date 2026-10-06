import { describe, expect, it, vi } from 'vitest';
import { createKeycloakClient, KeycloakError } from '../../src/client';

const USER_ID = '8b1c5f5e-7a62-4a0a-9a52-2f1b8f8c1e11';

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
}

function setup(...responses: Response[]) {
  const fetchMock = vi.fn<typeof fetch>();
  for (const r of responses) fetchMock.mockResolvedValueOnce(r);
  const client = createKeycloakClient({
    baseUrl: 'http://kc.test/',
    realm: 'company platform',
    getToken: () => 'admin-token',
    fetch: fetchMock,
  });
  return { client, fetchMock };
}

function call(fetchMock: ReturnType<typeof vi.fn<typeof fetch>>, index = 0) {
  const [url, init] = fetchMock.mock.calls[index]!;
  return { url: String(url), init: init as RequestInit };
}

describe('keycloak client', () => {
  it('lists users with search and paging, forwarding the admin token', async () => {
    const { client, fetchMock } = setup(
      jsonResponse([{ id: USER_ID, username: 'ann', enabled: true, extra: 'ignored' }]),
    );

    const users = await client.listUsers({ search: 'ann', first: 20, max: 10 });

    const { url, init } = call(fetchMock);
    expect(url).toBe(
      'http://kc.test/admin/realms/company%20platform/users?search=ann&first=20&max=10',
    );
    expect(init.method).toBe('GET');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer admin-token');
    expect(users).toEqual([{ id: USER_ID, username: 'ann', enabled: true, emailVerified: false }]);
  });

  it('omits empty query values', async () => {
    const { client, fetchMock } = setup(jsonResponse([]));
    await client.listUsers({ search: '', max: 5 });
    expect(call(fetchMock).url).toBe('http://kc.test/admin/realms/company%20platform/users?max=5');
  });

  it('counts users', async () => {
    const { client, fetchMock } = setup(jsonResponse(42));
    expect(await client.countUsers({ search: 'a' })).toBe(42);
    expect(call(fetchMock).url).toContain('/users/count?search=a');
  });

  it('gets one user', async () => {
    const { client, fetchMock } = setup(
      jsonResponse({ id: USER_ID, username: 'ann', email: 'ann@example.com' }),
    );
    const user = await client.getUser(USER_ID);
    expect(call(fetchMock).url).toContain(`/users/${USER_ID}`);
    expect(user.email).toBe('ann@example.com');
  });

  it('creates a user and returns the id from the Location header', async () => {
    const { client, fetchMock } = setup(
      new Response(null, {
        status: 201,
        headers: { Location: `http://kc.test/admin/realms/r/users/${USER_ID}` },
      }),
    );
    const id = await client.createUser({ username: 'ann', email: 'ann@example.com' });

    const { init } = call(fetchMock);
    expect(id).toBe(USER_ID);
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({
      enabled: true,
      username: 'ann',
      email: 'ann@example.com',
    });
  });

  it('disables a user with a partial update', async () => {
    const { client, fetchMock } = setup(new Response(null, { status: 204 }));
    await client.disableUser(USER_ID);
    const { init } = call(fetchMock);
    expect(init.method).toBe('PUT');
    expect(JSON.parse(init.body as string)).toEqual({ enabled: false });
  });

  it('logs out all sessions', async () => {
    const { client, fetchMock } = setup(new Response(null, { status: 204 }));
    await client.logoutAllSessions(USER_ID);
    const { url, init } = call(fetchMock);
    expect(url).toContain(`/users/${USER_ID}/logout`);
    expect(init.method).toBe('POST');
  });

  it('reads, adds and removes groups', async () => {
    const { client, fetchMock } = setup(
      jsonResponse([{ id: 'g1', name: 'Engineering', path: '/Engineering' }]),
      new Response(null, { status: 204 }),
      new Response(null, { status: 204 }),
    );
    const groups = await client.getUserGroups(USER_ID);
    await client.addUserToGroup(USER_ID, 'g1');
    await client.removeUserFromGroup(USER_ID, 'g1');

    expect(groups[0]?.name).toBe('Engineering');
    expect(call(fetchMock, 1).init.method).toBe('PUT');
    expect(call(fetchMock, 1).url).toContain(`/users/${USER_ID}/groups/g1`);
    expect(call(fetchMock, 2).init.method).toBe('DELETE');
  });

  it('resolves role names before adding and removing realm roles', async () => {
    const role = { id: 'r1', name: 'developer' };
    const { client, fetchMock } = setup(
      jsonResponse([role]),
      jsonResponse(role),
      new Response(null, { status: 204 }),
      jsonResponse(role),
      new Response(null, { status: 204 }),
    );

    expect(await client.getUserRealmRoles(USER_ID)).toEqual([role]);
    await client.addUserRealmRoles(USER_ID, ['developer']);
    await client.removeUserRealmRoles(USER_ID, ['developer']);

    expect(call(fetchMock, 1).url).toContain('/roles/developer');
    const add = call(fetchMock, 2);
    expect(add.init.method).toBe('POST');
    expect(add.url).toContain(`/users/${USER_ID}/role-mappings/realm`);
    expect(JSON.parse(add.init.body as string)).toEqual([role]);
    expect(call(fetchMock, 4).init.method).toBe('DELETE');
  });

  it('maps Keycloak errors to KeycloakError without leaking the token', async () => {
    const { client } = setup(jsonResponse({ errorMessage: 'User not found' }, { status: 404 }));
    const error = await client.getUser(USER_ID).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(KeycloakError);
    expect((error as KeycloakError).status).toBe(404);
    expect((error as KeycloakError).message).toContain('User not found');
    expect((error as KeycloakError).message).not.toContain('admin-token');
  });

  it('survives a non-JSON error body', async () => {
    const { client } = setup(
      new Response('Bad Gateway', { status: 502, statusText: 'Bad Gateway' }),
    );
    await expect(client.listUsers()).rejects.toMatchObject({ status: 502 });
  });
});
