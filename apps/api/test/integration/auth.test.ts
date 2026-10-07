import { beforeAll, describe, expect, it, vi } from 'vitest';
import {
  ISSUER,
  buildTestApp,
  bearer,
  createAuthHarness,
  type AuthHarness,
  type TokenOptions,
} from '../helpers/harness';

let harness: AuthHarness;
beforeAll(async () => {
  harness = await createAuthHarness();
});

describe('authentication', () => {
  it('serves /health without a token', async () => {
    const app = await buildTestApp(harness);
    const res = await app.inject({ url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok' });
  });

  it('rejects a missing token', async () => {
    const app = await buildTestApp(harness);
    const res = await app.inject({ url: '/templates' });
    expect(res.statusCode).toBe(401);
  });

  it.each<[string, TokenOptions]>([
    ['expired', { expiresIn: '-1m' }],
    ['issued by another issuer', { issuer: 'http://evil.test/realms/x' }],
    ['meant for another audience', { audience: 'account' }],
    ['signed by an unknown key', { untrustedKey: true }],
  ])('rejects a token that is %s', async (_name, options) => {
    const token = await harness.makeToken(options);
    const app = await buildTestApp(harness);
    const res = await app.inject({ url: '/templates', headers: bearer(token) });
    expect(res.statusCode).toBe(401);
  });

  it('rejects an HS256 token (algorithm pinning)', async () => {
    const token = await harness.makeHs256Token();
    const app = await buildTestApp(harness);
    const res = await app.inject({ url: '/templates', headers: bearer(token) });
    expect(res.statusCode).toBe(401);
  });

  it('rejects a malformed authorization header', async () => {
    const app = await buildTestApp(harness);
    const res = await app.inject({ url: '/templates', headers: { authorization: 'Basic abc' } });
    expect(res.statusCode).toBe(401);
  });
});

describe('role guard', () => {
  it('returns 403 for a valid token without an admin role', async () => {
    const token = await harness.makeToken({ roles: ['employee'] });
    const app = await buildTestApp(harness);
    const res = await app.inject({ url: '/templates', headers: bearer(token) });
    expect(res.statusCode).toBe(403);
  });

  it.each(['hr-admin', 'super-admin'])('allows the %s role', async (role) => {
    const token = await harness.makeToken({ roles: [role] });
    const app = await buildTestApp(harness);
    const res = await app.inject({ url: '/templates', headers: bearer(token) });
    expect(res.statusCode).toBe(200);
  });
});

describe('role guard configuration', () => {
  it('tells an admin which roles would give access', async () => {
    const token = await harness.makeToken({ roles: ['employee'] });
    const app = await buildTestApp(harness);
    const res = await app.inject({ url: '/templates', headers: bearer(token) });
    expect(res.json().message).toBe('Requires the super-admin or hr-admin role');
  });

  it('uses the configured admin roles instead of the defaults', async () => {
    const config = { adminRoles: ['it-admin'] };
    const app = await buildTestApp(harness, { config });

    const allowed = await harness.makeToken({ roles: ['it-admin'] });
    expect((await app.inject({ url: '/templates', headers: bearer(allowed) })).statusCode).toBe(
      200,
    );

    const defaultRole = await harness.makeToken({ roles: ['hr-admin'] });
    const denied = await app.inject({ url: '/templates', headers: bearer(defaultRole) });
    expect(denied.statusCode).toBe(403);
    expect(denied.json().message).toBe('Requires the it-admin role');
  });
});

describe('roles claim path', () => {
  const config = { rolesClaimPath: 'resource_access.accessdesk.roles' };
  const clientRoles = (roles: string[]) => ({
    claims: { resource_access: { accessdesk: { roles } } },
  });

  it('reads roles from the configured path', async () => {
    const app = await buildTestApp(harness, { config });
    const token = await harness.makeToken(clientRoles(['hr-admin']));
    expect((await app.inject({ url: '/templates', headers: bearer(token) })).statusCode).toBe(200);
  });

  it('ignores roles at the default path when another path is configured', async () => {
    const app = await buildTestApp(harness, { config });
    const token = await harness.makeToken({ roles: ['hr-admin'] });
    expect((await app.inject({ url: '/templates', headers: bearer(token) })).statusCode).toBe(403);
  });

  it('treats a claim that is absent anywhere along the path as no roles', async () => {
    const app = await buildTestApp(harness, { config });
    for (const claims of [{}, { resource_access: {} }, { resource_access: { accessdesk: {} } }]) {
      const token = await harness.makeToken({ claims });
      const res = await app.inject({ url: '/templates', headers: bearer(token) });
      expect(res.statusCode).toBe(403);
    }
  });

  it.each<[string, Record<string, unknown>]>([
    ['roles that are not a list', { realm_access: { roles: 'hr-admin' } }],
    ['roles that are not strings', { realm_access: { roles: [1, 2] } }],
    ['a parent that is not an object', { realm_access: 'hr-admin' }],
    ['a parent that is a list', { realm_access: ['hr-admin'] }],
    ['a null parent', { realm_access: null }],
  ])('rejects a token with %s as malformed', async (_name, claims) => {
    const app = await buildTestApp(harness);
    const token = await harness.makeToken({ claims });
    expect((await app.inject({ url: '/templates', headers: bearer(token) })).statusCode).toBe(401);
  });

  it('does not follow inherited properties', async () => {
    const app = await buildTestApp(harness, { config: { rolesClaimPath: 'constructor.name' } });
    const token = await harness.makeToken({ claims: { realm_access: { roles: ['hr-admin'] } } });
    expect((await app.inject({ url: '/templates', headers: bearer(token) })).statusCode).toBe(403);
  });
});

describe('key discovery', () => {
  const discovery = (harness: AuthHarness) =>
    vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url === `${ISSUER}/.well-known/openid-configuration`) {
        return Response.json({ issuer: ISSUER, jwks_uri: 'http://idp.test/keys' });
      }
      if (url === 'http://idp.test/keys') return Response.json(harness.jwks);
      return new Response('not found', { status: 404 });
    });

  it('verifies tokens with the keys the identity provider advertises', async () => {
    const fetchMock = discovery(harness);
    const app = await buildTestApp(harness, { discoverKeys: true, fetch: fetchMock });
    const token = await harness.makeToken();

    const res = await app.inject({ url: '/templates', headers: bearer(token) });

    expect(res.statusCode).toBe(200);
    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([
      `${ISSUER}/.well-known/openid-configuration`,
      'http://idp.test/keys',
    ]);
  });

  it('still rejects a token signed by a key the provider does not advertise', async () => {
    const app = await buildTestApp(harness, { discoverKeys: true, fetch: discovery(harness) });
    const token = await harness.makeToken({ untrustedKey: true });
    const res = await app.inject({ url: '/templates', headers: bearer(token) });
    expect(res.statusCode).toBe(401);
  });

  it('answers 401 while the identity provider is unreachable, and works once it is back', async () => {
    let up = false;
    const working = discovery(harness);
    const fetchMock = vi.fn<typeof fetch>(async (input, init) =>
      up ? working(input, init) : new Response('down', { status: 503 }),
    );
    const app = await buildTestApp(harness, { discoverKeys: true, fetch: fetchMock });
    const token = await harness.makeToken();

    expect((await app.inject({ url: '/templates', headers: bearer(token) })).statusCode).toBe(401);
    up = true;
    expect((await app.inject({ url: '/templates', headers: bearer(token) })).statusCode).toBe(200);
  });
});
