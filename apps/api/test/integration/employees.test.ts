import { IdentityProviderError, type IdentityUser } from '@accessdesk/identity';
import { createInMemoryIdentityProvider } from '@accessdesk/identity/testing';
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

const identityUser: IdentityUser = {
  subjectId: USER_ID,
  username: 'ann',
  email: 'ann@example.com',
  firstName: null,
  lastName: null,
  enabled: true,
  emailVerified: true,
  createdAt: null,
};

describe('GET /employees', () => {
  it("sends the admin's own token to the identity provider (no service account)", async () => {
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
      expect(String(url)).toMatch(/^http:\/\/idp\.test\//);
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

  it('reports an unreachable identity provider as a server error, not a crash', async () => {
    const identity = {
      listUsersPage: vi.fn().mockRejectedValue(new TypeError('connect ECONNREFUSED')),
    };
    const token = await harness.makeToken();
    const app = await buildTestApp(harness, { identity });

    const res = await app.inject({ url: '/employees', headers: bearer(token) });
    expect(res.statusCode).toBe(500);
    expect(res.body).not.toContain(token);
    expect(res.body).not.toContain('ECONNREFUSED');
  });

  it('answers 401 without a token and 403 for a member', async () => {
    const app = await buildTestApp(harness);
    const memberToken = await harness.makeToken({ roles: ['member'] });

    expect((await app.inject({ url: '/employees' })).statusCode).toBe(401);
    expect((await app.inject({ url: '/employees', headers: bearer(memberToken) })).statusCode).toBe(
      403,
    );
    expect((await app.inject({ url: '/employees/filter-options' })).statusCode).toBe(401);
    expect(
      (await app.inject({ url: '/employees/filter-options', headers: bearer(memberToken) }))
        .statusCode,
    ).toBe(403);
  });

  it('sends Cache-Control: no-store on the list, the filter options and one employee', async () => {
    const fake = createInMemoryIdentityProvider();
    const subjectId = await fake.provider.createUser({ username: 'ann' });
    const token = await harness.makeToken();
    const app = await buildTestApp(harness, { identity: fake.provider });

    for (const url of ['/employees', '/employees/filter-options', `/employees/${subjectId}`]) {
      const res = await app.inject({ url, headers: bearer(token) });
      expect(res.statusCode).toBe(200);
      expect(res.headers['cache-control']).toBe('no-store');
    }
  });

  describe('filters', () => {
    async function appWithPeople() {
      const fake = createInMemoryIdentityProvider({ memberFilterCap: 2 });
      const groupId = fake.seedGroup('Engineering');
      fake.seedRole('developer');
      const ids: string[] = [];
      for (const username of ['ann', 'bob', 'cy']) {
        const id = await fake.provider.createUser({ username });
        await fake.provider.addUserToGroup(id, groupId);
        await fake.provider.addUserRoles(id, ['developer']);
        ids.push(id);
      }
      await fake.provider.disableUser(ids[1]!);
      const token = await harness.makeToken();
      const app = await buildTestApp(harness, { identity: fake.provider });
      return { app, token, groupId, fake };
    }

    it('filters by enabled, passing the value as text in the query string', async () => {
      const { app, token } = await appWithPeople();

      const res = await app.inject({ url: '/employees?enabled=false', headers: bearer(token) });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ total: 1, capped: false, items: [{ username: 'bob' }] });
      const active = await app.inject({ url: '/employees?enabled=true', headers: bearer(token) });
      expect(active.json().total).toBe(2);
    });

    it('filters by group and says when the member cap was reached', async () => {
      const { app, token, groupId } = await appWithPeople();

      const res = await app.inject({
        url: `/employees?groupId=${groupId}&enabled=true`,
        headers: bearer(token),
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ capped: true, total: 1, items: [{ username: 'ann' }] });
    });

    it('filters by role', async () => {
      const { app, token } = await appWithPeople();

      const res = await app.inject({
        url: '/employees?role=developer&search=cy',
        headers: bearer(token),
      });

      expect(res.json()).toMatchObject({ total: 0, capped: true });
    });

    it.each([
      ['an enabled value that is not true or false', '/employees?enabled=yes'],
      ['both a group and a role', '/employees?groupId=g1&role=developer'],
      ['an empty group id', '/employees?groupId='],
      ['a role name that is too long', `/employees?role=${'r'.repeat(101)}`],
      ['a page size above 100', '/employees?max=101'],
    ])('refuses %s with 400', async (_label, url) => {
      const { app, token } = await appWithPeople();

      const res = await app.inject({ url, headers: bearer(token) });

      expect(res.statusCode).toBe(400);
      expect(res.json().error).toBe('bad_request');
    });

    it('refuses a group or role that does not exist, with a plain message', async () => {
      const { app, token } = await appWithPeople();

      const group = await app.inject({ url: '/employees?groupId=nope', headers: bearer(token) });
      const role = await app.inject({ url: '/employees?role=nope', headers: bearer(token) });

      expect(group.statusCode).toBe(400);
      expect(group.json()).toMatchObject({ error: 'unknown_group' });
      expect(role.statusCode).toBe(400);
      expect(role.json()).toMatchObject({ error: 'unknown_role' });
    });

    it('lists the filter options without built-in roles', async () => {
      const fake = createInMemoryIdentityProvider();
      const groupId = fake.seedGroup('Engineering');
      fake.seedRole('developer');
      fake.seedRole('uma_authorization', { builtin: true });
      const token = await harness.makeToken();
      const app = await buildTestApp(harness, { identity: fake.provider });

      const res = await app.inject({ url: '/employees/filter-options', headers: bearer(token) });

      expect(res.json()).toEqual({
        groups: [{ id: groupId, name: 'Engineering' }],
        roles: [{ name: 'developer' }],
      });
    });

    it('does not mistake the filter-options path for an employee id', async () => {
      const identity = {
        getUser: vi.fn(),
        listGroups: vi.fn().mockResolvedValue([]),
        listRoles: vi.fn().mockResolvedValue([]),
      };
      const token = await harness.makeToken();
      const app = await buildTestApp(harness, { identity });

      await app.inject({ url: '/employees/filter-options', headers: bearer(token) });

      expect(identity.getUser).not.toHaveBeenCalled();
    });

    it('maps an identity provider failure while filtering to 502', async () => {
      const identity = {
        listGroups: vi.fn().mockRejectedValue(new IdentityProviderError(500, 'down')),
      };
      const token = await harness.makeToken();
      const app = await buildTestApp(harness, { identity });

      const res = await app.inject({ url: '/employees?groupId=g1', headers: bearer(token) });

      expect(res.statusCode).toBe(502);
      expect(res.json().error).toBe('identity_error');
    });
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
    const identity = { getUser: vi.fn().mockResolvedValue(identityUser) };
    const token = await harness.makeToken();
    const app = await buildTestApp(harness, { identity });

    const res = await app.inject({ url: `/employees/${USER_ID}`, headers: bearer(token) });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ id: USER_ID, username: 'ann' });
    expect(identity.getUser).toHaveBeenCalledWith(USER_ID);
  });

  it.each([
    [404, 404],
    [403, 403],
    [401, 401],
    [500, 502],
    [503, 502],
  ])('maps an identity provider %i answer to %i', async (providerStatus, expected) => {
    const identity = {
      getUser: vi.fn().mockRejectedValue(new IdentityProviderError(providerStatus, 'nope')),
    };
    const token = await harness.makeToken();
    const app = await buildTestApp(harness, { identity });

    const res = await app.inject({ url: `/employees/${USER_ID}`, headers: bearer(token) });
    expect(res.statusCode).toBe(expected);
    expect(res.json().error).toBe('identity_error');
  });
});

describe('employee rate limits', () => {
  async function appWithOnePerson(rateLimitPerMinute?: number) {
    const fake = createInMemoryIdentityProvider();
    const groupId = fake.seedGroup('Engineering');
    await fake.provider.createUser({ username: 'ann' });
    const token = await harness.makeToken();
    const app = await buildTestApp(harness, {
      identity: fake.provider,
      ...(rateLimitPerMinute ? { config: { rateLimitPerMinute } } : {}),
    });
    return { app, headers: bearer(token), groupId };
  }

  async function statuses(
    app: Awaited<ReturnType<typeof appWithOnePerson>>['app'],
    url: string,
    headers: Record<string, string>,
    count: number,
  ) {
    const codes: number[] = [];
    for (let i = 0; i < count; i += 1) codes.push((await app.inject({ url, headers })).statusCode);
    return codes;
  }

  it('allows 240 plain or searched requests a minute, then answers 429', async () => {
    const { app, headers } = await appWithOnePerson();

    const codes = await statuses(app, '/employees?search=ann&enabled=true', headers, 241);

    expect(codes.slice(0, 240).every((code) => code === 200)).toBe(true);
    expect(codes[240]).toBe(429);
  });

  it('allows 90 group or role requests a minute, then answers 429', async () => {
    const { app, headers, groupId } = await appWithOnePerson();

    const byGroup = await statuses(app, `/employees?groupId=${groupId}`, headers, 91);

    expect(byGroup.slice(0, 90).every((code) => code === 200)).toBe(true);
    expect(byGroup[90]).toBe(429);
  });

  it('counts group and role requests together, apart from plain searching', async () => {
    const { app, headers, groupId } = await appWithOnePerson();
    await statuses(app, `/employees?groupId=${groupId}`, headers, 45);
    await statuses(app, '/employees?role=nope', headers, 45);

    const filtered = await app.inject({ url: `/employees?groupId=${groupId}`, headers });
    const plain = await app.inject({ url: '/employees?search=ann', headers });

    expect(filtered.statusCode).toBe(429);
    expect(plain.statusCode).toBe(200);
  });

  it('never lets a limit exceed a stricter API-wide limit', async () => {
    const { app, headers } = await appWithOnePerson(3);

    const codes = await statuses(app, '/employees', headers, 5);

    expect(codes).toEqual([200, 200, 200, 429, 429]);
  });

  it('limits the filter options and one employee on their own counters', async () => {
    const { app, headers } = await appWithOnePerson();

    const options = await statuses(app, '/employees/filter-options', headers, 241);
    const list = await app.inject({ url: '/employees', headers });

    expect(options[239]).toBe(200);
    expect(options[240]).toBe(429);
    expect(list.statusCode).toBe(200);
  });
});
