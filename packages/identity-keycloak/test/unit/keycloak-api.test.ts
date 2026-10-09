import { describe, expect, it } from 'vitest';
import { createKeycloakIdentityProvider } from '../../src/index';
import { parseIssuerUrl } from '../../src/keycloak-api';
import { SUBJECT_ID, call, jsonResponse, setup } from '../helpers/mock-fetch';

const ADMIN = 'http://idp.test/admin/realms/company%20platform';

describe('Keycloak Admin API calls', () => {
  it('lists users with search and paging, forwarding the admin token', async () => {
    const { provider, fetchMock } = setup(jsonResponse([]));

    await provider.listUsers({ search: 'ann', first: 20, max: 10 });

    const { url, init } = call(fetchMock);
    expect(url).toBe(`${ADMIN}/users?search=ann&first=20&max=10`);
    expect(init.method).toBe('GET');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer admin-token');
  });

  it('omits empty query values', async () => {
    const { provider, fetchMock } = setup(jsonResponse([]));
    await provider.listUsers({ search: '', max: 5 });
    expect(call(fetchMock).url).toBe(`${ADMIN}/users?max=5`);
  });

  it('counts users', async () => {
    const { provider, fetchMock } = setup(jsonResponse(42));
    expect(await provider.countUsers({ search: 'a' })).toBe(42);
    expect(call(fetchMock).url).toBe(`${ADMIN}/users/count?search=a`);
  });

  it('gets one user', async () => {
    const { provider, fetchMock } = setup(jsonResponse({ id: SUBJECT_ID, username: 'ann' }));
    await provider.getUser(SUBJECT_ID);
    expect(call(fetchMock).url).toBe(`${ADMIN}/users/${SUBJECT_ID}`);
  });

  it('creates a user and returns the ID from the Location header', async () => {
    const { provider, fetchMock } = setup(
      new Response(null, {
        status: 201,
        headers: { Location: `http://idp.test/admin/realms/r/users/${SUBJECT_ID}` },
      }),
    );
    const subjectId = await provider.createUser({ username: 'ann', email: 'ann@example.com' });

    const { init } = call(fetchMock);
    expect(subjectId).toBe(SUBJECT_ID);
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({
      enabled: true,
      username: 'ann',
      email: 'ann@example.com',
    });
  });

  it('creates a user with a verified email and a temporary password credential', async () => {
    const { provider, fetchMock } = setup(
      new Response(null, {
        status: 201,
        headers: { Location: `http://idp.test/admin/realms/r/users/${SUBJECT_ID}` },
      }),
    );
    await provider.createUser({
      username: 'ann',
      email: 'ann@example.com',
      firstName: 'Ann',
      lastName: 'Lee',
      emailVerified: true,
      initialPassword: { value: 'Temp-pass-123', temporary: true },
    });

    expect(JSON.parse(call(fetchMock).init.body as string)).toEqual({
      enabled: true,
      username: 'ann',
      email: 'ann@example.com',
      firstName: 'Ann',
      lastName: 'Lee',
      emailVerified: true,
      credentials: [{ type: 'password', value: 'Temp-pass-123', temporary: true }],
    });
  });

  it('sends a non-temporary password as a permanent credential', async () => {
    const { provider, fetchMock } = setup(
      new Response(null, {
        status: 201,
        headers: { Location: `http://idp.test/admin/realms/r/users/${SUBJECT_ID}` },
      }),
    );
    await provider.createUser({
      username: 'ann',
      initialPassword: { value: 'Perm-pass-123', temporary: false },
    });

    expect(JSON.parse(call(fetchMock).init.body as string).credentials).toEqual([
      { type: 'password', value: 'Perm-pass-123', temporary: false },
    ]);
  });

  it('looks users up by exact username', async () => {
    const { provider, fetchMock } = setup(jsonResponse([{ id: SUBJECT_ID, username: 'ann' }]));

    const found = await provider.findUsers({ username: 'ann', exact: true });

    expect(call(fetchMock).url).toBe(`${ADMIN}/users?username=ann&exact=true`);
    expect(found.map((user) => user.subjectId)).toEqual([SUBJECT_ID]);
  });

  it('looks users up by exact email with the value encoded', async () => {
    const { provider, fetchMock } = setup(jsonResponse([]));

    await provider.findUsers({ email: 'a+b@example.com', exact: true });

    expect(call(fetchMock).url).toBe(`${ADMIN}/users?email=a%2Bb%40example.com&exact=true`);
  });

  it('refuses an exact lookup that names neither a username nor an email', async () => {
    const { provider, fetchMock } = setup();

    await expect(provider.findUsers({ exact: true })).rejects.toMatchObject({ status: 400 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('lists the top-level groups in the brief form', async () => {
    const { provider, fetchMock } = setup(
      jsonResponse([{ id: 'g1', name: 'Engineering', path: '/Engineering' }]),
    );

    const groups = await provider.listGroups();

    expect(call(fetchMock).url).toBe(`${ADMIN}/groups?briefRepresentation=true&first=0&max=100`);
    expect(groups).toEqual([{ id: 'g1', name: 'Engineering', path: '/Engineering' }]);
  });

  it('pages through the groups until a short page arrives', async () => {
    const page = (from: number, count: number) =>
      jsonResponse(
        Array.from({ length: count }, (_, i) => ({
          id: `g${from + i}`,
          name: `Group ${from + i}`,
          path: `/Group ${from + i}`,
        })),
      );
    const { provider, fetchMock } = setup(page(0, 100), page(100, 3));

    const groups = await provider.listGroups();

    expect(groups).toHaveLength(103);
    expect(call(fetchMock, 1).url).toBe(
      `${ADMIN}/groups?briefRepresentation=true&first=100&max=100`,
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('stops paging groups at a fixed ceiling', async () => {
    const fullPage = () =>
      jsonResponse(
        Array.from({ length: 100 }, (_, i) => ({ id: `g${i}`, name: `G${i}`, path: `/G${i}` })),
      );
    const pages = Array.from({ length: 60 }, fullPage);
    const { provider, fetchMock } = setup(...pages);

    const groups = await provider.listGroups();

    expect(fetchMock).toHaveBeenCalledTimes(50);
    expect(groups).toHaveLength(5000);
  });

  it('lists the realm roles in the brief form and pages like groups', async () => {
    const page = (from: number, count: number) =>
      jsonResponse(
        Array.from({ length: count }, (_, i) => ({ id: `r${from + i}`, name: `role-${from + i}` })),
      );
    const { provider, fetchMock } = setup(page(0, 100), page(100, 2));

    const roles = await provider.listRoles();

    expect(call(fetchMock, 0).url).toBe(`${ADMIN}/roles?briefRepresentation=true&first=0&max=100`);
    expect(call(fetchMock, 1).url).toBe(
      `${ADMIN}/roles?briefRepresentation=true&first=100&max=100`,
    );
    expect(roles).toHaveLength(102);
    expect(roles[0]).toEqual({ name: 'role-0', description: null });
  });

  it('disables a user with a partial update', async () => {
    const { provider, fetchMock } = setup(new Response(null, { status: 204 }));
    await provider.disableUser(SUBJECT_ID);
    const { init } = call(fetchMock);
    expect(init.method).toBe('PUT');
    expect(JSON.parse(init.body as string)).toEqual({ enabled: false });
  });

  it('ends all sessions through the logout endpoint', async () => {
    const { provider, fetchMock } = setup(new Response(null, { status: 204 }));
    await provider.endAllSessions(SUBJECT_ID);
    const { url, init } = call(fetchMock);
    expect(url).toBe(`${ADMIN}/users/${SUBJECT_ID}/logout`);
    expect(init.method).toBe('POST');
  });

  it('reads, adds and removes groups', async () => {
    const { provider, fetchMock } = setup(
      jsonResponse([]),
      new Response(null, { status: 204 }),
      new Response(null, { status: 204 }),
    );
    await provider.getUserGroups(SUBJECT_ID);
    await provider.addUserToGroup(SUBJECT_ID, 'g1');
    await provider.removeUserFromGroup(SUBJECT_ID, 'g1');

    expect(call(fetchMock, 0).url).toBe(`${ADMIN}/users/${SUBJECT_ID}/groups`);
    expect(call(fetchMock, 1).init.method).toBe('PUT');
    expect(call(fetchMock, 1).url).toBe(`${ADMIN}/users/${SUBJECT_ID}/groups/g1`);
    expect(call(fetchMock, 2).init.method).toBe('DELETE');
  });

  it('resolves role names to realm role representations before adding and removing', async () => {
    const role = { id: 'r1', name: 'developer' };
    const { provider, fetchMock } = setup(
      jsonResponse([role]),
      jsonResponse(role),
      new Response(null, { status: 204 }),
      jsonResponse(role),
      new Response(null, { status: 204 }),
    );

    await provider.getUserRoles(SUBJECT_ID);
    await provider.addUserRoles(SUBJECT_ID, ['developer']);
    await provider.removeUserRoles(SUBJECT_ID, ['developer']);

    expect(call(fetchMock, 0).url).toBe(`${ADMIN}/users/${SUBJECT_ID}/role-mappings/realm`);
    expect(call(fetchMock, 1).url).toBe(`${ADMIN}/roles/developer`);
    const add = call(fetchMock, 2);
    expect(add.init.method).toBe('POST');
    expect(add.url).toBe(`${ADMIN}/users/${SUBJECT_ID}/role-mappings/realm`);
    expect(JSON.parse(add.init.body as string)).toEqual([role]);
    expect(call(fetchMock, 4).init.method).toBe('DELETE');
  });

  it('reads the error message from the answer body', async () => {
    const { provider } = setup(jsonResponse({ error: 'invalid_grant' }, { status: 400 }));
    await expect(provider.listUsers()).rejects.toThrow('(400): invalid_grant');
  });
});

describe('issuer URL', () => {
  it.each([
    ['http://idp.test/realms/company', 'http://idp.test', 'company'],
    ['https://sso.example.com/realms/company/', 'https://sso.example.com', 'company'],
    ['https://example.com/auth/realms/company', 'https://example.com/auth', 'company'],
    [
      'http://localhost:8080/realms/company%20platform',
      'http://localhost:8080',
      'company platform',
    ],
  ])('derives the Admin API location from %s', (issuerUrl, baseUrl, realm) => {
    expect(parseIssuerUrl(issuerUrl)).toEqual({ baseUrl, realm });
  });

  it.each([
    ['not a url', 'not a valid URL'],
    ['ftp://idp.test/realms/company', 'http:// or https://'],
    ['http://idp.test', '/realms/<realm>'],
    ['http://idp.test/realms/', '/realms/<realm>'],
    ['http://idp.test/realms/a/b', '/realms/<realm>'],
    ['http://idp.test/realms/company?x=1', '/realms/<realm>'],
    ['http://idp.test/realms/%E0%A4%A', 'realm in the issuer URL is not valid'],
  ])('rejects %s with a message that says what is wrong', (issuerUrl, message) => {
    expect(() => parseIssuerUrl(issuerUrl)).toThrow(message);
  });

  it('fails when the provider is created, not on the first request', () => {
    expect(() =>
      createKeycloakIdentityProvider({ issuerUrl: 'http://idp.test', getToken: () => 't' }),
    ).toThrow('/realms/<realm>');
  });
});
