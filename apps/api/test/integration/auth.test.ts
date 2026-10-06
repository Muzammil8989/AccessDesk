import { beforeAll, describe, expect, it } from 'vitest';
import {
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
