import { IdentityProviderError, type IdentityProvider } from '@accessdesk/identity';
import { createInMemoryIdentityProvider } from '@accessdesk/identity/testing';
import { ADMIN_ROLE_REASON } from '@accessdesk/shared';
import { Writable } from 'node:stream';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { RETRY_WINDOW_MS } from '../../src/modules/onboarding/onboarding.service';
import {
  buildTestApp,
  bearer,
  createAuthHarness,
  type AuthHarness,
  type TestAppOptions,
} from '../helpers/harness';
import { InMemoryAuditRepository } from '../helpers/in-memory-audit';

let harness: AuthHarness;
beforeAll(async () => {
  harness = await createAuthHarness();
});

const START = new Date('2026-10-08T10:00:00.000Z');
const PASSWORD_PATTERN = /^[a-hj-km-np-zA-HJ-NP-Z2-9]{16}$/;

function collectLogs() {
  const lines: string[] = [];
  const stream = new Writable({
    write(chunk: Buffer, _encoding, done) {
      lines.push(chunk.toString());
      done();
    },
  });
  return { stream, text: () => lines.join('') };
}

async function setup(
  options: {
    wrapIdentity?: (provider: IdentityProvider) => IdentityProvider;
    config?: TestAppOptions['config'];
  } = {},
) {
  const fake = createInMemoryIdentityProvider();
  const engineeringId = fake.seedGroup('Engineering');
  const salesId = fake.seedGroup('Sales');
  for (const role of ['member', 'manager', 'admin']) fake.seedRole(role);

  const clockState = { now: START };
  const clock = () => clockState.now;
  const audit = new InMemoryAuditRepository(clock);
  const logs = collectLogs();
  const app = await buildTestApp(harness, {
    identity: options.wrapIdentity ? options.wrapIdentity(fake.provider) : fake.provider,
    audit,
    clock,
    logStream: logs.stream,
    config: { logLevel: 'trace', ...options.config },
  });

  const body = {
    firstName: 'Ann',
    lastName: 'Lee',
    email: 'ann@example.com',
    username: 'ann.lee',
    departmentGroupId: engineeringId,
    role: 'member',
  };

  async function as(roles: string[], subject = 'admin-1') {
    return bearer(await harness.makeToken({ roles, subject }));
  }

  return { fake, app, audit, logs, clockState, engineeringId, salesId, body, as };
}

type Setup = Awaited<ReturnType<typeof setup>>;

const openApps: Setup['app'][] = [];
afterEach(async () => {
  await Promise.all(openApps.splice(0).map((app) => app.close()));
});

async function ready(options?: Parameters<typeof setup>[0]): Promise<Setup> {
  const s = await setup(options);
  openApps.push(s.app);
  return s;
}

describe('POST /onboarding', () => {
  it('creates the employee, adds them to the department, assigns the role and returns a one-time password', async () => {
    const s = await ready();

    const res = await s.app.inject({
      method: 'POST',
      url: '/onboarding',
      headers: await s.as(['hr-admin']),
      payload: s.body,
    });

    expect(res.statusCode).toBe(201);
    const result = res.json();
    expect(result.status).toBe('complete');
    expect(result.steps).toEqual([
      { name: 'create_user', status: 'done' },
      { name: 'add_to_group', status: 'done' },
      { name: 'assign_role', status: 'done' },
    ]);
    expect(result.temporaryPassword).toMatch(PASSWORD_PATTERN);
    expect(result.temporaryPassword).toMatch(/[a-z]/);
    expect(result.temporaryPassword).toMatch(/[A-Z]/);
    expect(result.temporaryPassword).toMatch(/[0-9]/);

    const stored = s.fake.inspect(result.subjectId);
    expect(stored).toEqual({
      groupIds: [s.engineeringId],
      roleNames: ['member'],
      initialPassword: { value: result.temporaryPassword, temporary: true },
    });
    expect(await s.fake.provider.getUser(result.subjectId)).toMatchObject({
      username: 'ann.lee',
      email: 'ann@example.com',
      firstName: 'Ann',
      lastName: 'Lee',
      enabled: true,
      emailVerified: true,
    });
  });

  it('never lets the response be cached', async () => {
    const s = await ready();
    const headers = await s.as(['hr-admin']);

    const created = await s.app.inject({
      method: 'POST',
      url: '/onboarding',
      headers,
      payload: s.body,
    });
    const options = await s.app.inject({ url: '/onboarding/options', headers });
    const rejected = await s.app.inject({
      method: 'POST',
      url: '/onboarding',
      headers,
      payload: { nope: true },
    });

    expect(created.headers['cache-control']).toBe('no-store');
    expect(options.headers['cache-control']).toBe('no-store');
    expect(rejected.headers['cache-control']).toBe('no-store');
  });

  it('lowercases and trims the input before it reaches the identity provider', async () => {
    const s = await ready();

    const res = await s.app.inject({
      method: 'POST',
      url: '/onboarding',
      headers: await s.as(['hr-admin']),
      payload: { ...s.body, email: ' Ann@Example.COM ', username: ' Ann.Lee ', firstName: ' Ann ' },
    });

    expect(res.statusCode).toBe(201);
    expect(await s.fake.provider.getUser(res.json().subjectId)).toMatchObject({
      username: 'ann.lee',
      email: 'ann@example.com',
      firstName: 'Ann',
    });
  });

  it('writes one audit row per step with the actor, target, request id and only safe details', async () => {
    const s = await ready();

    const res = await s.app.inject({
      method: 'POST',
      url: '/onboarding',
      headers: await s.as(['hr-admin'], 'admin-7'),
      payload: s.body,
    });

    const { subjectId } = res.json();
    const requestId = String(res.headers['x-request-id']);
    expect(s.audit.rows).toEqual([
      {
        actorId: 'admin-7',
        action: 'onboarding.create_user',
        outcome: 'SUCCESS',
        targetSubjectId: subjectId,
        requestId,
        details: undefined,
        createdAt: START,
      },
      {
        actorId: 'admin-7',
        action: 'onboarding.add_to_group',
        outcome: 'SUCCESS',
        targetSubjectId: subjectId,
        requestId,
        details: { groupId: s.engineeringId, groupName: 'Engineering' },
        createdAt: START,
      },
      {
        actorId: 'admin-7',
        action: 'onboarding.assign_role',
        outcome: 'SUCCESS',
        targetSubjectId: subjectId,
        requestId,
        details: { role: 'member' },
        createdAt: START,
      },
    ]);
  });

  it('never puts the password, names, email or username in the logs or the audit details', async () => {
    const s = await ready();

    const res = await s.app.inject({
      method: 'POST',
      url: '/onboarding',
      headers: await s.as(['hr-admin']),
      payload: s.body,
    });
    const password: string = res.json().temporaryPassword;
    const failing = await ready();
    failing.fake.failNext('addUserToGroup', new IdentityProviderError(500, 'boom'));
    await failing.app.inject({
      method: 'POST',
      url: '/onboarding',
      headers: await failing.as(['hr-admin']),
      payload: failing.body,
    });

    const audited = JSON.stringify([...s.audit.rows, ...failing.audit.rows]);
    for (const secret of [password, 'ann@example.com', 'ann.lee']) {
      expect(s.logs.text()).not.toContain(secret);
      expect(failing.logs.text()).not.toContain(secret);
    }
    for (const secret of [password, 'ann@example.com', 'ann.lee', 'Ann', 'Lee']) {
      expect(audited).not.toContain(secret);
    }
    expect(s.logs.text()).toContain(String(res.headers['x-request-id']));
  });

  it('lets a super-admin assign the admin role', async () => {
    const s = await ready();

    const res = await s.app.inject({
      method: 'POST',
      url: '/onboarding',
      headers: await s.as(['super-admin']),
      payload: { ...s.body, role: 'admin' },
    });

    expect(res.statusCode).toBe(201);
    expect(s.fake.inspect(res.json().subjectId)?.roleNames).toEqual(['admin']);
  });

  it('refuses an hr-admin who tries to assign the admin role, before touching anything', async () => {
    const s = await ready();

    const res = await s.app.inject({
      method: 'POST',
      url: '/onboarding',
      headers: await s.as(['hr-admin']),
      payload: { ...s.body, role: 'admin' },
    });

    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({ error: 'forbidden', message: ADMIN_ROLE_REASON });
    expect(s.fake.callCount('createUser')).toBe(0);
    expect(s.audit.rows).toEqual([]);
  });

  it('follows the configured super-admin role name', async () => {
    const s = await ready({
      config: { adminRoles: ['hr-admin', 'it-owner'], superAdminRole: 'it-owner' },
    });

    const refused = await s.app.inject({
      method: 'POST',
      url: '/onboarding',
      headers: await s.as(['hr-admin', 'super-admin']),
      payload: { ...s.body, role: 'admin' },
    });
    const allowed = await s.app.inject({
      method: 'POST',
      url: '/onboarding',
      headers: await s.as(['it-owner']),
      payload: { ...s.body, role: 'admin' },
    });

    expect(refused.statusCode).toBe(403);
    expect(allowed.statusCode).toBe(201);
  });

  it('rejects the owner role at the schema level', async () => {
    const s = await ready();

    const res = await s.app.inject({
      method: 'POST',
      url: '/onboarding',
      headers: await s.as(['super-admin']),
      payload: { ...s.body, role: 'owner' },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('bad_request');
    expect(s.fake.callCount('createUser')).toBe(0);
  });

  it.each([
    ['an empty body', {}],
    ['a bad email', { email: 'nope' }],
    ['a short username', { username: 'ab' }],
    ['a blank first name', { firstName: '   ' }],
    ['a control character in a name', { lastName: 'Le\u0007e' }],
    ['no department', { departmentGroupId: '' }],
  ])('rejects invalid input: %s', async (_label, patch) => {
    const s = await ready();

    const res = await s.app.inject({
      method: 'POST',
      url: '/onboarding',
      headers: await s.as(['hr-admin']),
      payload: Object.keys(patch).length === 0 ? {} : { ...s.body, ...patch },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('bad_request');
    expect(s.fake.callCount('createUser')).toBe(0);
  });

  it('rejects a department that is not one of the listed departments', async () => {
    const s = await ready();

    const res = await s.app.inject({
      method: 'POST',
      url: '/onboarding',
      headers: await s.as(['hr-admin']),
      payload: { ...s.body, departmentGroupId: 'not-a-department' },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({
      error: 'bad_request',
      message: 'The selected department does not exist',
    });
    expect(s.fake.callCount('createUser')).toBe(0);
  });

  it('answers 409 username_exists when the username is taken, without creating anything', async () => {
    const s = await ready();
    await s.fake.provider.createUser({ username: 'ann.lee', email: 'other@example.com' });

    const res = await s.app.inject({
      method: 'POST',
      url: '/onboarding',
      headers: await s.as(['hr-admin']),
      payload: s.body,
    });

    expect(res.statusCode).toBe(409);
    expect(res.json()).toEqual({ error: 'username_exists', message: 'Username already exists' });
    expect(s.fake.callCount('createUser')).toBe(1);
    expect(s.audit.rows).toEqual([]);
  });

  it('answers 409 email_exists when the email is taken', async () => {
    const s = await ready();
    await s.fake.provider.createUser({ username: 'someone', email: 'ann@example.com' });

    const res = await s.app.inject({
      method: 'POST',
      url: '/onboarding',
      headers: await s.as(['hr-admin']),
      payload: s.body,
    });

    expect(res.statusCode).toBe(409);
    expect(res.json()).toEqual({ error: 'email_exists', message: 'Email already exists' });
  });

  it('matches existing users case-insensitively', async () => {
    const s = await ready();
    await s.fake.provider.createUser({ username: 'ANN.LEE', email: 'x@example.com' });

    const res = await s.app.inject({
      method: 'POST',
      url: '/onboarding',
      headers: await s.as(['hr-admin']),
      payload: s.body,
    });

    expect(res.json().error).toBe('username_exists');
  });

  it('maps a conflict raised by the create call itself (a race) to the same 409', async () => {
    const s = await ready();
    s.fake.failNext('createUser', new IdentityProviderError(409, 'User exists with same username'));

    const res = await s.app.inject({
      method: 'POST',
      url: '/onboarding',
      headers: await s.as(['hr-admin']),
      payload: s.body,
    });

    expect(res.statusCode).toBe(409);
    expect(res.json().error).toBe('username_exists');
    expect(s.audit.rows).toMatchObject([
      { action: 'onboarding.create_user', outcome: 'FAILURE', targetSubjectId: undefined },
    ]);
  });

  it('names the email when the race was lost on the email address', async () => {
    const s = await ready({
      wrapIdentity: (provider) => ({
        ...provider,
        async createUser(input) {
          await provider.createUser({ username: 'sneaky', email: input.email });
          return provider.createUser(input);
        },
      }),
    });

    const res = await s.app.inject({
      method: 'POST',
      url: '/onboarding',
      headers: await s.as(['hr-admin']),
      payload: s.body,
    });

    expect(res.statusCode).toBe(409);
    expect(res.json().error).toBe('email_exists');
  });

  it('still answers 409 when the lookup after a race itself fails', async () => {
    const s = await ready();
    s.fake.failNext('createUser', new IdentityProviderError(409, 'exists'));
    let lookups = 0;
    const flaky: IdentityProvider = {
      ...s.fake.provider,
      async findUsers(params) {
        lookups += 1;
        if (lookups > 2) throw new IdentityProviderError(503, 'down');
        return s.fake.provider.findUsers(params);
      },
    };
    const app = await buildTestApp(harness, { identity: flaky, audit: s.audit });
    openApps.push(app);

    const res = await app.inject({
      method: 'POST',
      url: '/onboarding',
      headers: await s.as(['hr-admin']),
      payload: s.body,
    });

    expect(res.statusCode).toBe(409);
    expect(res.json().error).toBe('username_exists');
  });

  it.each([
    [403, 403],
    [500, 502],
    [503, 502],
  ])(
    'passes a provider failure while creating the user through the existing mapping (%i -> %i)',
    async (providerStatus, expected) => {
      const s = await ready();
      s.fake.failNext('createUser', new IdentityProviderError(providerStatus, 'nope'));

      const res = await s.app.inject({
        method: 'POST',
        url: '/onboarding',
        headers: await s.as(['hr-admin']),
        payload: s.body,
      });

      expect(res.statusCode).toBe(expected);
      expect(res.json().error).toBe('identity_error');
      expect(s.audit.rows).toMatchObject([
        { action: 'onboarding.create_user', outcome: 'FAILURE' },
      ]);
    },
  );

  it('keeps the user and answers 207 when adding to the group fails', async () => {
    const s = await ready();
    s.fake.failNext('addUserToGroup', new IdentityProviderError(500, 'boom'));

    const res = await s.app.inject({
      method: 'POST',
      url: '/onboarding',
      headers: await s.as(['hr-admin']),
      payload: s.body,
    });

    expect(res.statusCode).toBe(207);
    const result = res.json();
    expect(result.status).toBe('partial');
    expect(result.temporaryPassword).toMatch(PASSWORD_PATTERN);
    expect(result.steps).toEqual([
      { name: 'create_user', status: 'done' },
      {
        name: 'add_to_group',
        status: 'failed',
        message: 'The identity provider could not complete this step.',
      },
      { name: 'assign_role', status: 'skipped', message: 'Not run because an earlier step failed' },
    ]);
    expect(await s.fake.provider.findUsers({ username: 'ann.lee', exact: true })).toHaveLength(1);
    expect(s.fake.inspect(result.subjectId)).toMatchObject({ groupIds: [], roleNames: [] });
    expect(s.audit.rows.map((row) => [row.action, row.outcome])).toEqual([
      ['onboarding.create_user', 'SUCCESS'],
      ['onboarding.add_to_group', 'FAILURE'],
    ]);
    expect(s.fake.callCount('disableUser')).toBe(0);
  });

  it('answers 207 when assigning the role fails and says which permission may be missing', async () => {
    const s = await ready();
    s.fake.failNext('addUserRoles', new IdentityProviderError(403, 'forbidden'));

    const res = await s.app.inject({
      method: 'POST',
      url: '/onboarding',
      headers: await s.as(['hr-admin']),
      payload: s.body,
    });

    expect(res.statusCode).toBe(207);
    expect(res.json().steps).toEqual([
      { name: 'create_user', status: 'done' },
      { name: 'add_to_group', status: 'done' },
      {
        name: 'assign_role',
        status: 'failed',
        message:
          'The identity provider refused this step. Your account may be missing a permission.',
      },
    ]);
    expect(s.logs.text()).toContain('Onboarding step failed');
    expect(s.logs.text()).toContain('"step":"assign_role"');
    expect(s.logs.text()).toContain('"identityProviderStatus":403');
  });

  it('still returns the result and logs the request id when an audit row cannot be written', async () => {
    const s = await ready();
    s.audit.failWrites = true;

    const res = await s.app.inject({
      method: 'POST',
      url: '/onboarding',
      headers: await s.as(['hr-admin']),
      payload: s.body,
    });

    expect(res.statusCode).toBe(201);
    expect(res.json().status).toBe('complete');
    const requestId = String(res.headers['x-request-id']);
    expect(s.logs.text()).toContain('Audit log write failed');
    expect(s.logs.text()).toContain(requestId);
    expect(s.logs.text()).not.toContain('audit store unavailable');
  });

  it('rejects a caller without an admin role', async () => {
    const s = await ready();

    const res = await s.app.inject({
      method: 'POST',
      url: '/onboarding',
      headers: await s.as(['member']),
      payload: s.body,
    });

    expect(res.statusCode).toBe(403);
    expect(s.fake.callCount('createUser')).toBe(0);
  });

  it('rejects a request without a token', async () => {
    const s = await ready();

    const res = await s.app.inject({ method: 'POST', url: '/onboarding', payload: s.body });

    expect(res.statusCode).toBe(401);
    expect(s.fake.callCount('createUser')).toBe(0);
  });
});

describe('POST /onboarding/:subjectId/retry', () => {
  async function partialOnboarding(s: Setup, failing: 'addUserToGroup' | 'addUserRoles') {
    s.fake.failNext(failing, new IdentityProviderError(500, 'boom'));
    const res = await s.app.inject({
      method: 'POST',
      url: '/onboarding',
      headers: await s.as(['hr-admin']),
      payload: s.body,
    });
    expect(res.statusCode).toBe(207);
    return res.json().subjectId as string;
  }

  const retryBody = (s: Setup, role = 'member') => ({
    departmentGroupId: s.engineeringId,
    role,
  });

  it('finishes the remaining steps without returning a password', async () => {
    const s = await ready();
    const subjectId = await partialOnboarding(s, 'addUserToGroup');

    const res = await s.app.inject({
      method: 'POST',
      url: `/onboarding/${subjectId}/retry`,
      headers: await s.as(['hr-admin']),
      payload: retryBody(s),
    });

    expect(res.statusCode).toBe(200);
    const result = res.json();
    expect(result).toEqual({
      status: 'complete',
      subjectId,
      steps: [
        { name: 'create_user', status: 'skipped', message: 'Already done' },
        { name: 'add_to_group', status: 'done' },
        { name: 'assign_role', status: 'done' },
      ],
    });
    expect(res.headers['cache-control']).toBe('no-store');
    expect(s.fake.inspect(subjectId)).toMatchObject({
      groupIds: [s.engineeringId],
      roleNames: ['member'],
    });
    expect(s.audit.rows.map((row) => [row.action, row.outcome])).toEqual([
      ['onboarding.create_user', 'SUCCESS'],
      ['onboarding.add_to_group', 'FAILURE'],
      ['onboarding.add_to_group', 'SUCCESS'],
      ['onboarding.assign_role', 'SUCCESS'],
    ]);
  });

  it('skips the steps that are already satisfied and does not repeat their calls', async () => {
    const s = await ready();
    const subjectId = await partialOnboarding(s, 'addUserRoles');
    const groupCallsBefore = s.fake.callCount('addUserToGroup');

    const res = await s.app.inject({
      method: 'POST',
      url: `/onboarding/${subjectId}/retry`,
      headers: await s.as(['hr-admin']),
      payload: retryBody(s),
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().steps).toEqual([
      { name: 'create_user', status: 'skipped', message: 'Already done' },
      { name: 'add_to_group', status: 'skipped', message: 'Already done' },
      { name: 'assign_role', status: 'done' },
    ]);
    expect(s.fake.callCount('addUserToGroup')).toBe(groupCallsBefore);
  });

  it('is idempotent: a second retry changes nothing', async () => {
    const s = await ready();
    const subjectId = await partialOnboarding(s, 'addUserToGroup');
    const send = async () =>
      s.app.inject({
        method: 'POST',
        url: `/onboarding/${subjectId}/retry`,
        headers: await s.as(['hr-admin']),
        payload: retryBody(s),
      });
    await send();
    const rowsAfterFirst = s.audit.rows.length;

    const second = await send();

    expect(second.statusCode).toBe(200);
    expect(second.json().steps.map((step: { status: string }) => step.status)).toEqual([
      'skipped',
      'skipped',
      'skipped',
    ]);
    expect(s.audit.rows).toHaveLength(rowsAfterFirst);
  });

  it('answers 207 again when a step still fails', async () => {
    const s = await ready();
    const subjectId = await partialOnboarding(s, 'addUserToGroup');
    s.fake.failNext('addUserToGroup', new IdentityProviderError(500, 'still broken'));

    const res = await s.app.inject({
      method: 'POST',
      url: `/onboarding/${subjectId}/retry`,
      headers: await s.as(['hr-admin']),
      payload: retryBody(s),
    });

    expect(res.statusCode).toBe(207);
    expect(res.json().status).toBe('partial');
    expect(res.json()).not.toHaveProperty('temporaryPassword');
  });

  it('refuses a subject that has no matching audit row', async () => {
    const s = await ready();
    const stranger = await s.fake.provider.createUser({ username: 'stranger' });

    const res = await s.app.inject({
      method: 'POST',
      url: `/onboarding/${stranger}/retry`,
      headers: await s.as(['hr-admin']),
      payload: retryBody(s),
    });

    expect(res.statusCode).toBe(403);
    expect(res.json().error).toBe('forbidden');
    expect(s.fake.callCount('addUserToGroup')).toBe(0);
  });

  it('refuses a retry from a different actor than the one who created the user', async () => {
    const s = await ready();
    const subjectId = await partialOnboarding(s, 'addUserToGroup');

    const res = await s.app.inject({
      method: 'POST',
      url: `/onboarding/${subjectId}/retry`,
      headers: await s.as(['hr-admin'], 'someone-else'),
      payload: retryBody(s),
    });

    expect(res.statusCode).toBe(403);
  });

  it('only trusts a create_user row that was a success', async () => {
    const s = await ready();
    const subjectId = '8b1c5f5e-7a62-4a0a-9a52-2f1b8f8c1e11';
    await s.audit.record({
      actorId: 'admin-1',
      action: 'onboarding.create_user',
      outcome: 'FAILURE',
      targetSubjectId: subjectId,
    });

    const res = await s.app.inject({
      method: 'POST',
      url: `/onboarding/${subjectId}/retry`,
      headers: await s.as(['hr-admin']),
      payload: retryBody(s),
    });

    expect(res.statusCode).toBe(403);
  });

  it('allows a retry within 24 hours and refuses one after', async () => {
    const s = await ready();
    const subjectId = await partialOnboarding(s, 'addUserToGroup');
    const send = async () =>
      s.app.inject({
        method: 'POST',
        url: `/onboarding/${subjectId}/retry`,
        headers: await s.as(['hr-admin']),
        payload: retryBody(s),
      });

    s.clockState.now = new Date(START.getTime() + RETRY_WINDOW_MS + 1);
    const tooLate = await send();
    s.clockState.now = new Date(START.getTime() + RETRY_WINDOW_MS - 1000);
    const inTime = await send();

    expect(tooLate.statusCode).toBe(403);
    expect(inTime.statusCode).toBe(200);
  });

  it('applies the same role rule as onboarding', async () => {
    const s = await ready();
    const subjectId = await partialOnboarding(s, 'addUserToGroup');

    const res = await s.app.inject({
      method: 'POST',
      url: `/onboarding/${subjectId}/retry`,
      headers: await s.as(['hr-admin']),
      payload: retryBody(s, 'admin'),
    });

    expect(res.statusCode).toBe(403);
    expect(res.json().message).toBe(ADMIN_ROLE_REASON);
  });

  it('validates the subject id, the role and the department', async () => {
    const s = await ready();
    const subjectId = await partialOnboarding(s, 'addUserToGroup');
    const headers = await s.as(['hr-admin']);

    const badId = await s.app.inject({
      method: 'POST',
      url: '/onboarding/not-a-uuid/retry',
      headers,
      payload: retryBody(s),
    });
    const owner = await s.app.inject({
      method: 'POST',
      url: `/onboarding/${subjectId}/retry`,
      headers,
      payload: retryBody(s, 'owner'),
    });
    const department = await s.app.inject({
      method: 'POST',
      url: `/onboarding/${subjectId}/retry`,
      headers,
      payload: { departmentGroupId: 'nope', role: 'member' },
    });

    expect(badId.statusCode).toBe(400);
    expect(owner.statusCode).toBe(400);
    expect(department.statusCode).toBe(400);
    expect(department.json().message).toBe('The selected department does not exist');
  });

  it('rejects a member and an unauthenticated caller', async () => {
    const s = await ready();
    const subjectId = '8b1c5f5e-7a62-4a0a-9a52-2f1b8f8c1e11';

    const member = await s.app.inject({
      method: 'POST',
      url: `/onboarding/${subjectId}/retry`,
      headers: await s.as(['member']),
      payload: retryBody(s),
    });
    const anonymous = await s.app.inject({
      method: 'POST',
      url: `/onboarding/${subjectId}/retry`,
      payload: retryBody(s),
    });

    expect(member.statusCode).toBe(403);
    expect(anonymous.statusCode).toBe(401);
  });
});

describe('GET /onboarding/options', () => {
  it('lists the departments by name and marks admin as not allowed for an hr-admin', async () => {
    const s = await ready();

    const res = await s.app.inject({
      url: '/onboarding/options',
      headers: await s.as(['hr-admin']),
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      departments: [
        { id: s.engineeringId, name: 'Engineering' },
        { id: s.salesId, name: 'Sales' },
      ],
      roles: [
        { name: 'member', allowed: true },
        { name: 'manager', allowed: true },
        { name: 'admin', allowed: false, reason: ADMIN_ROLE_REASON },
      ],
    });
  });

  it('allows every role for a super-admin', async () => {
    const s = await ready();

    const res = await s.app.inject({
      url: '/onboarding/options',
      headers: await s.as(['super-admin']),
    });

    expect(res.json().roles.every((role: { allowed: boolean }) => role.allowed)).toBe(true);
  });

  it('returns an empty department list when the provider has none', async () => {
    const s = await ready();
    const empty = createInMemoryIdentityProvider();
    const app = await buildTestApp(harness, { identity: empty.provider });
    openApps.push(app);

    const res = await app.inject({
      url: '/onboarding/options',
      headers: await s.as(['hr-admin']),
    });

    expect(res.json().departments).toEqual([]);
  });

  it('passes a provider permission failure through the existing mapping', async () => {
    const s = await ready();
    s.fake.failNext('listGroups', new IdentityProviderError(403, 'no permission'));

    const res = await s.app.inject({
      url: '/onboarding/options',
      headers: await s.as(['hr-admin']),
    });

    expect(res.statusCode).toBe(403);
    expect(res.json().error).toBe('identity_error');
  });

  it('rejects a member and an unauthenticated caller', async () => {
    const s = await ready();

    const member = await s.app.inject({
      url: '/onboarding/options',
      headers: await s.as(['member']),
    });
    const anonymous = await s.app.inject({ url: '/onboarding/options' });

    expect(member.statusCode).toBe(403);
    expect(anonymous.statusCode).toBe(401);
  });
});

describe('onboarding rate limit', () => {
  it('allows 20 requests a minute to the onboarding routes, then answers 429', async () => {
    const s = await ready();
    const headers = await s.as(['hr-admin']);

    const statuses: number[] = [];
    for (let attempt = 0; attempt < 21; attempt += 1) {
      statuses.push((await s.app.inject({ url: '/onboarding/options', headers })).statusCode);
    }

    expect(statuses.slice(0, 20).every((status) => status === 200)).toBe(true);
    expect(statuses[20]).toBe(429);
  });

  it('limits the create route on its own, and leaves other routes on the default limit', async () => {
    const s = await ready();
    const headers = await s.as(['hr-admin']);

    const statuses: number[] = [];
    for (let attempt = 0; attempt < 21; attempt += 1) {
      statuses.push(
        (await s.app.inject({ method: 'POST', url: '/onboarding', headers, payload: {} }))
          .statusCode,
      );
    }
    const employees = await s.app.inject({ url: '/employees', headers });

    expect(statuses.slice(0, 20).every((status) => status === 400)).toBe(true);
    expect(statuses[20]).toBe(429);
    expect(employees.statusCode).toBe(200);
  });
});
