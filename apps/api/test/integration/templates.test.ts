import { beforeAll, describe, expect, it, vi } from 'vitest';
import {
  buildTestApp,
  bearer,
  createAuthHarness,
  fakeTemplateRepository,
  type AuthHarness,
} from '../helpers/harness';

let harness: AuthHarness;
beforeAll(async () => {
  harness = await createAuthHarness();
});

describe('GET /templates', () => {
  it('returns what the repository provides', async () => {
    const token = await harness.makeToken();
    const app = await buildTestApp(harness);
    const res = await app.inject({ url: '/templates', headers: bearer(token) });

    expect(res.statusCode).toBe(200);
    expect(res.json().items[0]).toMatchObject({
      name: 'Developer',
      items: [{ title: 'Add to group', kind: 'GROUP_MEMBERSHIP', position: 0 }],
    });
  });

  it('does not leak storage errors', async () => {
    const templates = fakeTemplateRepository();
    vi.mocked(templates.listWithItems).mockRejectedValue(new Error('password=hunter2 refused'));
    const token = await harness.makeToken();
    const app = await buildTestApp(harness, { templates });

    const res = await app.inject({ url: '/templates', headers: bearer(token) });
    expect(res.statusCode).toBe(500);
    expect(res.json()).toEqual({ error: 'internal', message: 'Internal server error' });
  });
});
