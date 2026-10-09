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
      code: 'forbidden',
    });
  });

  it('leaves the code out when the error body has none', async () => {
    const { client } = setup({
      responses: [Response.json({ message: 'Nope' }, { status: 400 })],
    });

    expect(await client.get('/employees')).toEqual({ ok: false, status: 400, message: 'Nope' });
  });

  it('falls back to the status text when the error body is not understood', async () => {
    const { client } = setup({
      responses: [new Response('<html>', { status: 500, statusText: 'Server Error' })],
    });

    expect(await client.get('/employees')).toEqual({
      ok: false,
      status: 500,
      message: 'Server Error',
    });
  });

  it('reports that the app is not configured when there are no settings', async () => {
    const client = createApiClient({
      getSettings: async () => null,
      auth: { getAccessToken: async () => 'tok', forceRefresh: async () => null },
      fetch: vi.fn<typeof fetch>(),
    });

    expect(await client.get('/employees')).toEqual({
      ok: false,
      status: 0,
      message: 'The app is not configured yet',
    });
  });

  it('reports a failure to renew the session', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    const client = createApiClient({
      getSettings: async () => settings,
      auth: {
        getAccessToken: vi.fn().mockRejectedValue(new Error('idp down')),
        forceRefresh: async () => null,
      },
      fetch: fetchMock,
    });

    expect(await client.get('/employees')).toMatchObject({ ok: false, status: 0 });
    expect(fetchMock).not.toHaveBeenCalled();
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

const employeeInput = {
  firstName: 'Ann',
  lastName: 'Lee',
  email: 'Ann@Example.com',
  username: 'ann.lee',
  departmentGroupId: 'g1',
  role: 'member',
};

const SUBJECT_ID = '8b1c5f5e-7a62-4a0a-9a52-2f1b8f8c1e11';

describe('onboarding calls in the main process', () => {
  it('posts the validated employee to /onboarding and returns a 201 body', async () => {
    const created = {
      status: 'complete',
      subjectId: SUBJECT_ID,
      steps: [],
      temporaryPassword: 'abc',
    };
    const { client, fetchMock } = setup({
      responses: [Response.json(created, { status: 201 })],
    });

    const result = await client.createOnboarding(employeeInput);

    expect(result).toEqual({ ok: true, status: 201, data: created });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe('http://api.test/onboarding');
    expect(init?.method).toBe('POST');
    expect(init?.redirect).toBe('error');
    const headers = init?.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer tok-1');
    expect(headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(init?.body as string)).toEqual({
      ...employeeInput,
      email: 'ann@example.com',
    });
  });

  it('treats a 207 as a success with a body, so the partial result and password arrive', async () => {
    const partial = {
      status: 'partial',
      subjectId: SUBJECT_ID,
      steps: [{ name: 'add_to_group', status: 'failed', message: 'x' }],
      temporaryPassword: 'abc',
    };
    const { client } = setup({ responses: [Response.json(partial, { status: 207 })] });

    expect(await client.createOnboarding(employeeInput)).toEqual({
      ok: true,
      status: 207,
      data: partial,
    });
  });

  it('keeps the error code of a 409 so the form can mark the right field', async () => {
    const { client } = setup({
      responses: [
        Response.json(
          { error: 'username_exists', message: 'Username already exists' },
          { status: 409 },
        ),
      ],
    });

    expect(await client.createOnboarding(employeeInput)).toEqual({
      ok: false,
      status: 409,
      message: 'Username already exists',
      code: 'username_exists',
    });
  });

  it('does not call the API for input that fails the shared schema', async () => {
    const { client, fetchMock } = setup({ responses: [] });

    expect(await client.createOnboarding({ ...employeeInput, role: 'owner' })).toEqual({
      ok: false,
      status: 400,
      message: 'Invalid request',
    });
    expect(await client.createOnboarding(null)).toMatchObject({ status: 400 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not repeat a create request after a network failure or timeout', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockRejectedValue(new TypeError('socket hang up'));
    const forceRefresh = vi.fn().mockResolvedValue('tok-2');
    const client = createApiClient({
      getSettings: async () => settings,
      auth: { getAccessToken: async () => 'tok-1', forceRefresh },
      fetch: fetchMock,
    });

    const result = await client.createOnboarding(employeeInput);

    expect(result).toMatchObject({ ok: false, status: 0 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(forceRefresh).not.toHaveBeenCalled();
  });

  it('sends a create request again only once, with a fresh token, after a 401', async () => {
    const { client, fetchMock } = setup({
      fresh: 'tok-2',
      responses: [
        Response.json({ message: 'expired' }, { status: 401 }),
        Response.json({ status: 'complete', subjectId: SUBJECT_ID, steps: [] }, { status: 201 }),
      ],
    });

    const result = await client.createOnboarding(employeeInput);

    expect(result).toMatchObject({ ok: true, status: 201 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect((fetchMock.mock.calls[1]![1]?.headers as Record<string, string>).Authorization).toBe(
      'Bearer tok-2',
    );
  });

  it('gives a write request more time than a read', async () => {
    const timeout = vi.spyOn(AbortSignal, 'timeout');
    const { client } = setup({
      responses: [Response.json({}, { status: 201 }), Response.json({})],
    });

    await client.createOnboarding(employeeInput);
    await client.get('/employees');

    expect(timeout.mock.calls.map(([ms]) => ms)).toEqual([30_000, 15_000]);
    timeout.mockRestore();
  });

  it('posts a retry to the fixed path for a valid subject id', async () => {
    const { client, fetchMock } = setup({
      responses: [Response.json({ status: 'complete', subjectId: SUBJECT_ID, steps: [] })],
    });

    const result = await client.retryOnboarding(SUBJECT_ID, {
      departmentGroupId: 'g1',
      role: 'manager',
    });

    expect(result).toMatchObject({ ok: true, status: 200 });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe(`http://api.test/onboarding/${SUBJECT_ID}/retry`);
    expect(init?.method).toBe('POST');
    expect(JSON.parse(init?.body as string)).toEqual({ departmentGroupId: 'g1', role: 'manager' });
  });

  it.each([
    ['a path-like subject id', '../employees', { departmentGroupId: 'g1', role: 'member' }],
    ['a subject id with a query', `${SUBJECT_ID}?x=1`, { departmentGroupId: 'g1', role: 'member' }],
    ['a non-string subject id', 42, { departmentGroupId: 'g1', role: 'member' }],
    ['the owner role', SUBJECT_ID, { departmentGroupId: 'g1', role: 'owner' }],
    ['no department', SUBJECT_ID, { role: 'member' }],
  ])('refuses a retry with %s without calling the API', async (_label, subjectId, input) => {
    const { client, fetchMock } = setup({ responses: [] });

    expect(await client.retryOnboarding(subjectId, input)).toEqual({
      ok: false,
      status: 400,
      message: 'Invalid request',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('keeps the 403 of a retry that is not allowed', async () => {
    const { client } = setup({
      responses: [
        Response.json({ error: 'forbidden', message: 'Not yours to retry' }, { status: 403 }),
      ],
    });

    expect(
      await client.retryOnboarding(SUBJECT_ID, { departmentGroupId: 'g1', role: 'member' }),
    ).toEqual({ ok: false, status: 403, message: 'Not yours to retry', code: 'forbidden' });
  });
});

describe('API path validation', () => {
  it.each([
    '/employees',
    '/employees/8b1c5f5e-7a62-4a0a-9a52-2f1b8f8c1e11',
    '/templates',
    '/onboarding/options',
    '/checklists',
    '/checklists/8b1c5f5e-7a62-4a0a-9a52-2f1b8f8c1e11',
  ])('accepts %s', (p) => expect(apiPathSchema.safeParse(p).success).toBe(true));

  it.each([
    'employees',
    '//evil.test/x',
    'http://evil.test/x',
    '/../admin',
    '/employees?x=1',
    '/employees/../x',
    '/Employees',
    '/audit-log',
    '/onboarding',
    '/onboarding/8b1c5f5e-7a62-4a0a-9a52-2f1b8f8c1e11/retry',
    '/employees/not-a-uuid',
    '/templates/8b1c5f5e-7a62-4a0a-9a52-2f1b8f8c1e11',
    '/checklists/8b1c5f5e-7a62-4a0a-9a52-2f1b8f8c1e11/items/8b1c5f5e-7a62-4a0a-9a52-2f1b8f8c1e11',
    '/employees/',
    '/employees/8b1c5f5e-7a62-4a0a-9a52-2f1b8f8c1e11/',
    '/employees\n',
  ])('rejects %j', (p) => expect(apiPathSchema.safeParse(p).success).toBe(false));
});
