import { IdentityProviderError } from '@accessdesk/identity';
import { createInMemoryIdentityProvider } from '@accessdesk/identity/testing';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { bearer, buildTestApp, createAuthHarness, type AuthHarness } from '../helpers/harness';
import { InMemoryAuditRepository } from '../helpers/in-memory-audit';
import { InMemoryChecklistRepository, nextId } from '../helpers/in-memory-checklists';

let harness: AuthHarness;
beforeAll(async () => {
  harness = await createAuthHarness();
});

const NOW = new Date('2026-10-09T12:00:00.000Z');
const MISSING = '00000000-0000-4000-8000-0000000000ff';

async function setup() {
  const fake = createInMemoryIdentityProvider();
  const engineeringId = fake.seedGroup('Engineering');
  for (const role of ['member', 'manager', 'admin']) fake.seedRole(role);
  const audit = new InMemoryAuditRepository(() => NOW);
  const checklists = new InMemoryChecklistRepository(audit, {});
  const app = await buildTestApp(harness, {
    identity: fake.provider,
    audit,
    checklists,
    clock: () => NOW,
  });
  const as = async (roles: string[], subject = 'admin-1') =>
    bearer(await harness.makeToken({ roles, subject }));
  const person = (username: string, names: { firstName?: string; lastName?: string } = {}) =>
    fake.provider.createUser({ username, email: `${username}@example.com`, ...names });
  const body = {
    firstName: 'Ann',
    lastName: 'Lee',
    email: 'ann@example.com',
    username: 'ann.lee',
    departmentGroupId: engineeringId,
    role: 'member',
  };
  return { fake, audit, checklists, app, as, person, body };
}
type Setup = Awaited<ReturnType<typeof setup>>;

const open: Setup['app'][] = [];
afterEach(async () => {
  await Promise.all(open.splice(0).map((app) => app.close()));
});
async function ready(): Promise<Setup> {
  const s = await setup();
  open.push(s.app);
  return s;
}

const post = async (s: Setup, payload: unknown, roles = ['hr-admin']) =>
  s.app.inject({
    method: 'POST',
    url: '/onboarding',
    headers: await s.as(roles),
    payload: payload as Record<string, unknown>,
  });

const get = async (s: Setup, url: string) =>
  s.app.inject({ url, headers: await s.as(['hr-admin']) });

describe('POST /onboarding with a manager and a start date', () => {
  it('answers 201, creates an open checklist, and saves only the manager id and the date', async () => {
    const s = await ready();
    const manager = await s.person('boss', { firstName: 'Bea', lastName: 'Boss' });

    const res = await post(s, { ...s.body, managerSubjectId: manager, startDate: '2026-10-20' });

    expect(res.statusCode).toBe(201);
    expect(res.json().steps.at(-1)).toEqual({ name: 'create_checklist', status: 'done' });
    expect(s.checklists.rows).toMatchObject([
      { managerSubjectId: manager, startDate: '2026-10-20', status: 'open', items: [] },
    ]);
    const stored = JSON.stringify([s.checklists.rows, s.audit.rows]);
    for (const personal of ['Bea', 'Boss', 'boss@example.com', 'Ann', 'ann.lee']) {
      expect(stored).not.toContain(personal);
    }
  });

  it('enables the account at once, whatever the start date', async () => {
    const s = await ready();

    const res = await post(s, { ...s.body, startDate: '2031-05-01' });

    expect(await s.fake.provider.getUser(res.json().subjectId)).toMatchObject({ enabled: true });
  });

  it('answers 400 unknown_manager, before creating anything, for a manager that does not exist', async () => {
    const s = await ready();

    const res = await post(s, { ...s.body, managerSubjectId: MISSING });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({
      error: 'unknown_manager',
      message: 'The selected manager was not found',
    });
    expect(s.fake.callCount('createUser')).toBe(0);
    expect(s.audit.rows).toEqual([]);
  });

  it('answers 400 manager_disabled, before creating anything, for a disabled manager', async () => {
    const s = await ready();
    const manager = await s.person('boss');
    await s.fake.provider.disableUser(manager);
    const created = s.fake.callCount('createUser');

    const res = await post(s, { ...s.body, managerSubjectId: manager });

    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('manager_disabled');
    expect(s.fake.callCount('createUser')).toBe(created);
  });

  it('passes a provider failure through instead of saying the manager is unknown', async () => {
    const s = await ready();
    s.fake.failNext('getUser', new IdentityProviderError(403, 'no permission'));

    const res = await post(s, { ...s.body, managerSubjectId: MISSING });

    expect(res.statusCode).toBe(403);
    expect(res.json().error).toBe('identity_error');
  });

  it.each([
    ['a manager id that is not a UUID', { managerSubjectId: '../x' }],
    ['a date in the wrong format', { startDate: '20-10-2026' }],
    ['a date that does not exist', { startDate: '2026-02-30' }],
    ['a date with a time', { startDate: '2026-10-20T10:00:00Z' }],
    ['an empty date', { startDate: '' }],
  ])('rejects %s with 400 and creates nothing', async (_label, patch) => {
    const s = await ready();

    const res = await post(s, { ...s.body, ...patch });

    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('bad_request');
    expect(s.fake.callCount('createUser')).toBe(0);
  });

  it('retries with the same manager and start date, and rejects a bad one', async () => {
    const s = await ready();
    const manager = await s.person('boss');
    s.checklists.failCreate = true;
    const first = await post(s, { ...s.body, managerSubjectId: manager, startDate: '2026-10-20' });
    expect(first.statusCode).toBe(207);
    s.checklists.failCreate = false;
    const url = `/onboarding/${first.json().subjectId}/retry`;
    const payload = {
      departmentGroupId: s.body.departmentGroupId,
      role: 'member',
      managerSubjectId: manager,
      startDate: '2026-10-20',
    };

    const bad = await s.app.inject({
      method: 'POST',
      url,
      headers: await s.as(['hr-admin']),
      payload: { ...payload, startDate: 'soon' },
    });
    const retry = await s.app.inject({
      method: 'POST',
      url,
      headers: await s.as(['hr-admin']),
      payload,
    });

    expect(bad.statusCode).toBe(400);
    expect(retry.statusCode).toBe(200);
    expect(s.checklists.rows).toMatchObject([
      { managerSubjectId: manager, startDate: '2026-10-20' },
    ]);
  });
});

describe('the lists and the detail show the manager and the start date', () => {
  it('shows the manager by name, looked up live, and the start date, in the Open list and the detail', async () => {
    const s = await ready();
    const ann = await s.person('ann.lee', { firstName: 'Ann', lastName: 'Lee' });
    const boss = await s.person('boss', { firstName: 'Bea', lastName: 'Boss' });
    s.checklists.seed(ann, [], { managerSubjectId: boss, startDate: '2026-10-20' });

    const list = await get(s, '/checklists');
    const detail = await get(s, `/checklists/${ann}`);

    expect(list.json().items[0]).toMatchObject({
      subjectId: ann,
      status: 'open',
      totalCount: 0,
      doneCount: 0,
      manager: { subjectId: boss, person: { displayName: 'Bea Boss', username: 'boss' } },
      startDate: '2026-10-20',
    });
    expect(detail.json()).toMatchObject({
      status: 'open',
      manager: { subjectId: boss, person: { displayName: 'Bea Boss', username: 'boss' } },
      startDate: '2026-10-20',
      items: [],
    });
  });

  it('keeps a checklist that has only a manager or a start date in the Open list until it is closed', async () => {
    const s = await ready();
    const ann = await s.person('ann.lee');
    s.checklists.seed(ann, [], { startDate: '2026-10-20' });
    const ids = async (status: string) =>
      (await get(s, `/checklists?status=${status}`))
        .json()
        .items.map((item: { subjectId: string }) => item.subjectId);

    expect(await ids('open')).toEqual([ann]);
    expect(await ids('done')).toEqual([]);

    await s.app.inject({
      method: 'PATCH',
      url: `/checklists/${ann}`,
      headers: await s.as(['hr-admin']),
      payload: { closed: true },
    });

    expect(await ids('open')).toEqual([]);
    expect(await ids('done')).toEqual([ann]);
  });

  it('shows the manager as unknown when the identity provider no longer has them', async () => {
    const s = await ready();
    const ann = await s.person('ann.lee');
    s.checklists.seed(ann, ['A'], { managerSubjectId: nextId() });

    const detail = await get(s, `/checklists/${ann}`);

    expect(detail.statusCode).toBe(200);
    expect(detail.json().manager.person).toBeNull();
  });

  it('has no manager and no start date when none was saved', async () => {
    const s = await ready();
    const ann = await s.person('ann.lee');
    s.checklists.seed(ann, ['A']);

    const detail = await get(s, `/checklists/${ann}`);

    expect(detail.json()).toMatchObject({ manager: null, startDate: null });
  });
});

describe('PATCH /checklists/:subjectId (close or reopen)', () => {
  const patch = async (s: Setup, subjectId: string, payload: unknown, roles = ['hr-admin']) =>
    s.app.inject({
      method: 'PATCH',
      url: `/checklists/${subjectId}`,
      headers: await s.as(roles, 'admin-7'),
      payload: payload as Record<string, unknown>,
    });

  async function withEmpty() {
    const s = await ready();
    const subject = await s.person('ann.lee');
    const row = s.checklists.seed(subject, [], { startDate: '2026-10-20' });
    return { s, subject, row };
  }

  it('closes a checklist that has no tasks, and writes one audit row', async () => {
    const { s, subject } = await withEmpty();

    const res = await patch(s, subject, { closed: true });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      status: 'done',
      completedAt: NOW.toISOString(),
      startDate: '2026-10-20',
    });
    expect(s.audit.rows).toEqual([
      {
        actorId: 'admin-7',
        action: 'checklist.close',
        outcome: 'SUCCESS',
        targetSubjectId: subject,
        requestId: String(res.headers['x-request-id']),
        details: undefined,
        createdAt: NOW,
      },
    ]);
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('reopens it, and writes an audit row for the reopening', async () => {
    const { s, subject } = await withEmpty();
    await patch(s, subject, { closed: true });

    const res = await patch(s, subject, { closed: false });

    expect(res.json()).toMatchObject({ status: 'open', completedAt: null });
    expect(s.audit.rows.map((row) => row.action)).toEqual(['checklist.close', 'checklist.reopen']);
  });

  it('is safe to repeat, and still writes an audit row for every successful request', async () => {
    const { s, subject } = await withEmpty();

    const first = await patch(s, subject, { closed: true });
    const second = await patch(s, subject, { closed: true });

    expect(second.json()).toEqual(first.json());
    expect(s.audit.rows).toHaveLength(2);
  });

  it('answers 409 checklist_has_tasks for a checklist with tasks, changing and writing nothing', async () => {
    const s = await ready();
    const subject = await s.person('ann.lee');
    s.checklists.seed(subject, ['Order laptop']);

    const res = await patch(s, subject, { closed: true });

    expect(res.statusCode).toBe(409);
    expect(res.json()).toEqual({
      error: 'checklist_has_tasks',
      message: 'A checklist with tasks is done when every task is done',
    });
    expect((await get(s, `/checklists/${subject}`)).json().status).toBe('open');
    expect(s.audit.rows).toEqual([]);
  });

  it('rolls the close back when its audit row cannot be written', async () => {
    const { s, subject } = await withEmpty();
    s.audit.failWrites = true;

    const res = await patch(s, subject, { closed: true });
    s.audit.failWrites = false;

    expect(res.statusCode).toBe(500);
    expect((await get(s, `/checklists/${subject}`)).json().status).toBe('open');
    expect(s.audit.rows).toEqual([]);
  });

  it('answers 404 for a subject without a checklist', async () => {
    const s = await ready();

    const res = await patch(s, MISSING, { closed: true });

    expect(res.statusCode).toBe(404);
    expect(res.json().message).toBe('Checklist not found');
  });

  it.each([
    ['no body', undefined],
    ['an empty body', {}],
    ['closed as a string', { closed: 'yes' }],
    ['closed as a number', { closed: 1 }],
  ])('rejects %s with 400 and changes nothing', async (_label, payload) => {
    const { s, subject } = await withEmpty();

    const res = await patch(s, subject, payload);

    expect(res.statusCode).toBe(400);
    expect((await get(s, `/checklists/${subject}`)).json().status).toBe('open');
    expect(s.audit.rows).toEqual([]);
  });

  it('rejects an id that is not a UUID with 400', async () => {
    const s = await ready();

    expect((await patch(s, 'not-a-uuid', { closed: true })).statusCode).toBe(400);
  });

  it('answers 401 without a token and 403 for a member', async () => {
    const { s, subject } = await withEmpty();

    const anonymous = await s.app.inject({
      method: 'PATCH',
      url: `/checklists/${subject}`,
      payload: { closed: true },
    });
    const member = await patch(s, subject, { closed: true }, ['member']);

    expect(anonymous.statusCode).toBe(401);
    expect(member.statusCode).toBe(403);
    expect(s.audit.rows).toEqual([]);
  });
});
