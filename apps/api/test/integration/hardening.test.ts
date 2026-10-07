import { beforeAll, describe, expect, it, vi } from 'vitest';
import { buildTestApp, bearer, createAuthHarness, type AuthHarness } from '../helpers/harness';

let harness: AuthHarness;
beforeAll(async () => {
  harness = await createAuthHarness();
});

describe('response headers', () => {
  it('sends security headers and a request id on every response', async () => {
    const app = await buildTestApp(harness);
    const res = await app.inject({ url: '/health' });

    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBeDefined();
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('gives each request its own id, including rejected ones', async () => {
    const app = await buildTestApp(harness);
    const a = await app.inject({ url: '/templates' });
    const b = await app.inject({ url: '/templates' });
    expect(a.statusCode).toBe(401);
    expect(a.headers['x-request-id']).not.toBe(b.headers['x-request-id']);
  });
});

describe('unknown routes', () => {
  it('answers authenticated requests with the API error shape', async () => {
    const token = await harness.makeToken();
    const app = await buildTestApp(harness);
    const res = await app.inject({ url: '/nope', headers: bearer(token) });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: 'not_found', message: 'Route not found' });
  });
});

describe('rate limiting', () => {
  it('answers 429 after too many requests, and counts invalid tokens too', async () => {
    const app = await buildTestApp(harness, { config: { rateLimitPerMinute: 3 } });
    const statuses: number[] = [];
    for (let i = 0; i < 5; i++) {
      statuses.push((await app.inject({ url: '/templates' })).statusCode);
    }
    expect(statuses).toEqual([401, 401, 401, 429, 429]);
  });

  it('uses the standard error shape for 429', async () => {
    const app = await buildTestApp(harness, { config: { rateLimitPerMinute: 1 } });
    await app.inject({ url: '/templates' });
    const res = await app.inject({ url: '/templates' });
    expect(res.statusCode).toBe(429);
    expect(res.json().error).toBe('too_many_requests');
  });

  it('never throttles the health probes', async () => {
    const app = await buildTestApp(harness, { config: { rateLimitPerMinute: 1 } });
    for (let i = 0; i < 5; i++) {
      expect((await app.inject({ url: '/health' })).statusCode).toBe(200);
    }
  });
});

describe('request limits', () => {
  it('refuses oversized bodies with 413', async () => {
    const token = await harness.makeToken();
    const app = await buildTestApp(harness);
    const res = await app.inject({
      method: 'POST',
      url: '/templates',
      headers: { ...bearer(token), 'content-type': 'application/json' },
      payload: JSON.stringify({ filler: 'x'.repeat(200 * 1024) }),
    });
    expect(res.statusCode).toBe(413);
    expect(res.json().error).toBe('payload_too_large');
  });

  it("treats malformed JSON as the client's mistake (400), not a server fault", async () => {
    const token = await harness.makeToken();
    const app = await buildTestApp(harness);
    const res = await app.inject({
      method: 'POST',
      url: '/templates',
      headers: { ...bearer(token), 'content-type': 'application/json' },
      payload: '{ not json',
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('readiness', () => {
  it('is ready when the database answers', async () => {
    const app = await buildTestApp(harness);
    const res = await app.inject({ url: '/ready' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ready' });
  });

  it('reports 503 without leaking details when the database is down', async () => {
    const checkDatabase = vi.fn().mockRejectedValue(new Error('password authentication failed'));
    const app = await buildTestApp(harness, { checkDatabase });
    const res = await app.inject({ url: '/ready' });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toEqual({ status: 'unavailable', reason: 'database' });
    expect(res.body).not.toContain('password');
  });

  it('stays alive (liveness) even when the database is down', async () => {
    const checkDatabase = vi.fn().mockRejectedValue(new Error('down'));
    const app = await buildTestApp(harness, { checkDatabase });
    expect((await app.inject({ url: '/health' })).statusCode).toBe(200);
    expect(checkDatabase).not.toHaveBeenCalled();
  });
});
