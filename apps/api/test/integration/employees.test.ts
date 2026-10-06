import { KeycloakError } from '@accessdesk/keycloak-client';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import {
  USER_ID,
  buildTestApp,
  bearer,
  createAuthHarness,
  type AuthHarness,
} from '../helpers/harness';

let harness: AuthHarness;
beforeAll(async () => {
  harness = await createAuthHarness();
});

const kcUser = {
  id: USER_ID,
  username: 'ann',
  email: 'ann@example.com',
  createdTimestamp: 0,
  enabled: true,
  emailVerified: true,
};

describe('GET /employees', () => {
  it("sends the admin's own token to Keycloak (no service account)", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json([kcUser]))
      .mockResolvedValueOnce(Response.json(41));
    const token = await harness.makeToken();
    const app = await buildTestApp(harness, { fetch: fetchMock });

    const res = await app.inject({
      url: '/employees?search=ann&first=20&max=10',
      headers: bearer(token),
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      total: 41,
      first: 20,
      max: 10,
      items: [{ id: USER_ID, username: 'ann', email: 'ann@example.com', enabled: true }],
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    for (const [url, init] of fetchMock.mock.calls) {
      expect(String(url)).toContain('http://kc.test/admin/realms/company-platform/users');
      expect((init?.headers as Record<string, string>).Authorization).toBe(`Bearer ${token}`);
    }
  });

  it('validates query input', async () => {
    const token = await harness.makeToken();
    const app = await buildTestApp(harness);
    const res = await app.inject({ url: '/employees?max=1000', headers: bearer(token) });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('bad_request');
  });

  it('reports an unreachable Keycloak as a server error, not a crash', async () => {
    const keycloak = {
      listUsers: vi.fn().mockRejectedValue(new TypeError('connect ECONNREFUSED')),
      countUsers: vi.fn().mockResolvedValue(0),
    };
    const token = await harness.makeToken();
    const app = await buildTestApp(harness, { keycloak });

    const res = await app.inject({ url: '/employees', headers: bearer(token) });
    expect(res.statusCode).toBe(500);
    expect(res.body).not.toContain(token);
    expect(res.body).not.toContain('ECONNREFUSED');
  });
});

describe('GET /employees/:id', () => {
  it('rejects ids that are not UUIDs', async () => {
    const token = await harness.makeToken();
    const app = await buildTestApp(harness);
    const res = await app.inject({ url: '/employees/..%2Fmaster', headers: bearer(token) });
    expect(res.statusCode).toBe(400);
  });

  it('returns the employee', async () => {
    const keycloak = { getUser: vi.fn().mockResolvedValue(kcUser) };
    const token = await harness.makeToken();
    const app = await buildTestApp(harness, { keycloak });

    const res = await app.inject({ url: `/employees/${USER_ID}`, headers: bearer(token) });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ id: USER_ID, username: 'ann' });
    expect(keycloak.getUser).toHaveBeenCalledWith(USER_ID);
  });

  it.each([
    [404, 404],
    [403, 403],
    [401, 401],
    [500, 502],
    [503, 502],
  ])('maps a Keycloak %i answer to %i', async (keycloakStatus, expected) => {
    const keycloak = {
      getUser: vi.fn().mockRejectedValue(new KeycloakError(keycloakStatus, 'nope')),
    };
    const token = await harness.makeToken();
    const app = await buildTestApp(harness, { keycloak });

    const res = await app.inject({ url: `/employees/${USER_ID}`, headers: bearer(token) });
    expect(res.statusCode).toBe(expected);
    expect(res.json().error).toBe('keycloak_error');
  });
});
