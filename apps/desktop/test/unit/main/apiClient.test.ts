import type { AppSettings } from '@accessdesk/shared';
import { describe, expect, it, vi } from 'vitest';
import { apiPathSchema, createApiClient } from '../../../src/main/apiClient';

const settings: AppSettings = {
  issuerUrl: 'http://idp.test/realms/r',
  clientId: 'accessdesk',
  apiUrl: 'http://api.test',
};

function setup(options: { token?: string | null; fresh?: string | null; responses: Response[] }) {
  const fetchMock = vi.fn<typeof fetch>();
  for (const r of options.responses) fetchMock.mockResolvedValueOnce(r);
  const auth = {
    getAccessToken: vi
      .fn()
      .mockResolvedValue(options.token === undefined ? 'tok-1' : options.token),
    forceRefresh: vi.fn().mockResolvedValue(options.fresh ?? null),
  };
  const client = createApiClient({ getSettings: async () => settings, auth, fetch: fetchMock });
  return { client, fetchMock, auth };
}

describe('API client in the main process', () => {
  it('adds the bearer token and query string, and returns only the body', async () => {
    const { client, fetchMock } = setup({ responses: [Response.json({ items: [] })] });
    const result = await client.get('/employees', { search: 'ann', max: 20 });

    expect(result).toEqual({ ok: true, status: 200, data: { items: [] } });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe('http://api.test/employees?search=ann&max=20');
    expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer tok-1');
    expect(init?.redirect).toBe('error');
  });

  it('retries once with a refreshed token after a 401', async () => {
    const { client, fetchMock, auth } = setup({
      fresh: 'tok-2',
      responses: [Response.json({ message: 'expired' }, { status: 401 }), Response.json({ ok: 1 })],
    });
    const result = await client.get('/templates');

    expect(result.ok).toBe(true);
    expect(auth.forceRefresh).toHaveBeenCalledOnce();
    expect((fetchMock.mock.calls[1]![1]?.headers as Record<string, string>).Authorization).toBe(
      'Bearer tok-2',
    );
  });

  it('surfaces the API error message', async () => {
    const { client } = setup({
      responses: [
        Response.json({ error: 'forbidden', message: 'Requires hr-admin' }, { status: 403 }),
      ],
    });
    expect(await client.get('/employees')).toEqual({
      ok: false,
      status: 403,
      message: 'Requires hr-admin',
    });
  });

  it('reports 401 without calling the API when there is no session', async () => {
    const { client, fetchMock } = setup({ token: null, responses: [] });
    expect(await client.get('/employees')).toMatchObject({ ok: false, status: 401 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('explains network failures without leaking the token', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockRejectedValue(new TypeError('ECONNREFUSED'));
    const client = createApiClient({
      getSettings: async () => settings,
      auth: { getAccessToken: async () => 'tok-1', forceRefresh: async () => null },
      fetch: fetchMock,
    });
    const result = await client.get('/employees');
    expect(result).toMatchObject({ ok: false, status: 0 });
    expect(JSON.stringify(result)).not.toContain('tok-1');
  });
});

describe('API path validation', () => {
  it.each(['/employees', '/employees/8b1c5f5e-7a62-4a0a-9a52-2f1b8f8c1e11', '/audit-log'])(
    'accepts %s',
    (p) => expect(apiPathSchema.safeParse(p).success).toBe(true),
  );

  it.each([
    'employees',
    '//evil.test/x',
    'http://evil.test/x',
    '/../admin',
    '/employees?x=1',
    '/employees/../x',
    '/Employees',
  ])('rejects %s', (p) => expect(apiPathSchema.safeParse(p).success).toBe(false));
});
