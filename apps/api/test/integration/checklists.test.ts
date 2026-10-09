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
  const employee = (username: string, names: { firstName?: string; lastName?: string } = {}) =>
    fake.provider.createUser({ username, email: `${username}@example.com`, ...names });
  return { fake, audit, checklists, app, as, employee };
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

const get = async (s: Setup, url: string, roles = ['hr-admin']) =>
  s.app.inject({ url, headers: await s.as(roles) });

const patch = async (
  s: Setup,
  url: string,
  payload: unknown,
  roles = ['hr-admin'],
  subject?: string,
) =>
  s.app.inject({
    method: 'PATCH',
    url,
    headers: await s.as(roles, subject),
    payload: payload as Record<string, unknown>,
  });

describe('access', () => {
  it.each([
    ['GET', '/checklists'],
    ['GET', `/checklists/${MISSING}`],
    ['PATCH', `/checklists/${MISSING}/items/${MISSING}`],
  ])('%s %s answers 401 without a token and 403 for a member', async (method, url) => {
    const s = await ready();

    const anonymous = await s.app.inject({
      method: method as 'GET' | 'PATCH',
      url,
      payload: method === 'PATCH' ? { done: true } : undefined,
    });
    const member = await s.app.inject({
      method: method as 'GET' | 'PATCH',
      url,
      headers: await s.as(['member']),
      payload: method === 'PATCH' ? { done: true } : undefined,
    });

    expect(anonymous.statusCode).toBe(401);
    expect(member.statusCode).toBe(403);
  });

  it('never lets a response be cached', async () => {
    const s = await ready();
    const subject = await s.employee('ann');
    const checklist = s.checklists.seed(subject, ['Order laptop']);

    const list = await get(s, '/checklists');
    const detail = await get(s, `/checklists/${subject}`);
    const tick = await patch(s, `/checklists/${subject}/items/${checklist.items[0]!.id}`, {
      done: true,
    });
    const missing = await get(s, `/checklists/${MISSING}`);

    for (const res of [list, detail, tick, missing]) {
      expect(res.headers['cache-control']).toBe('no-store');
    }
  });
});

describe('GET /checklists', () => {
  it('lists open checklists newest first, with progress and the name looked up live', async () => {
    const s = await ready();
    const ann = await s.employee('ann.lee', { firstName: 'Ann', lastName: 'Lee' });
    const bob = await s.employee('bob');
    const older = s.checklists.seed(ann, ['A', 'B', 'C'], {
      createdAt: new Date('2026-10-01T00:00:00Z'),
    });
    older.items[0]!.status = 'done';
    s.checklists.seed(bob, ['A'], { createdAt: new Date('2026-10-05T00:00:00Z') });

    const res = await get(s, '/checklists');

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      total: 2,
      first: 0,
      max: 20,
      items: [
        {
          subjectId: bob,
          status: 'open',
          createdAt: '2026-10-05T00:00:00.000Z',
          completedAt: null,
          totalCount: 1,
          doneCount: 0,
          person: { displayName: 'bob', username: 'bob' },
          manager: null,
          startDate: null,
        },
        {
          subjectId: ann,
          status: 'open',
          createdAt: '2026-10-01T00:00:00.000Z',
          completedAt: null,
          totalCount: 3,
          doneCount: 1,
          person: { displayName: 'Ann Lee', username: 'ann.lee' },
          manager: null,
          startDate: null,
        },
      ],
    });
  });

  it('shows null for a person the identity provider no longer knows, and still answers 200', async () => {
    const s = await ready();
    s.checklists.seed(nextId(), ['A']);

    const res = await get(s, '/checklists');

    expect(res.statusCode).toBe(200);
    expect(res.json().items[0].person).toBeNull();
  });

  it('shows null for everyone, and still answers 200, when the provider refuses the lookups', async () => {
    const s = await ready();
    s.checklists.seed(await s.employee('ann'), ['A']);
    s.fake.failNext('getUser', new IdentityProviderError(403, 'no permission'));

    const res = await get(s, '/checklists');

    expect(res.statusCode).toBe(200);
    expect(res.json().items[0].person).toBeNull();
  });

  it('filters by open and done', async () => {
    const s = await ready();
    const doneSubject = await s.employee('done.one');
    const openSubject = await s.employee('open.one');
    s.checklists.seed(doneSubject, ['A'], { status: 'done' });
    s.checklists.seed(openSubject, ['A']);

    const done = await get(s, '/checklists?status=done');
    const opened = await get(s, '/checklists?status=open');
    const byDefault = await get(s, '/checklists');

    expect(done.json().items.map((item: { subjectId: string }) => item.subjectId)).toEqual([
      doneSubject,
    ]);
    expect(opened.json().items.map((item: { subjectId: string }) => item.subjectId)).toEqual([
      openSubject,
    ]);
    expect(byDefault.json()).toEqual(opened.json());
  });

  it('never returns more than 20 in a page, and pages through the rest', async () => {
    const s = await ready();
    for (let i = 0; i < 25; i += 1) {
      s.checklists.seed(nextId(), ['A'], { createdAt: new Date(Date.UTC(2026, 9, 1, 0, i)) });
    }

    const first = await get(s, '/checklists');
    const second = await get(s, '/checklists?first=20');
    const small = await get(s, '/checklists?max=5&first=5');

    expect(first.json().items).toHaveLength(20);
    expect(first.json().total).toBe(25);
    expect(second.json().items).toHaveLength(5);
    expect(small.json()).toMatchObject({ first: 5, max: 5 });
    expect(small.json().items).toHaveLength(5);
  });

  it('never asks the identity provider for more than 5 people at once', async () => {
    const s = await ready();
    let inFlight = 0;
    let peak = 0;
    const provider = {
      ...s.fake.provider,
      async getUser(subjectId: string) {
        inFlight += 1;
        peak = Math.max(peak, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 2));
        inFlight -= 1;
        return s.fake.provider.getUser(subjectId);
      },
    };
    const app = await buildTestApp(harness, {
      identity: provider,
      audit: s.audit,
      checklists: s.checklists,
    });
    open.push(app);
    for (let i = 0; i < 20; i += 1) s.checklists.seed(await s.employee(`user${i}`), ['A']);

    const res = await app.inject({ url: '/checklists', headers: await s.as(['hr-admin']) });

    expect(res.json().items).toHaveLength(20);
    expect(res.json().items.every((item: { person: unknown }) => item.person !== null)).toBe(true);
    expect(peak).toBeGreaterThan(1);
    expect(peak).toBeLessThanOrEqual(5);
  });

  it.each(['status=all', 'max=21', 'max=0', 'first=-1', 'first=abc', 'max=1.5'])(
    'rejects the query %s with 400',
    async (query) => {
      const s = await ready();

      const res = await get(s, `/checklists?${query}`);

      expect(res.statusCode).toBe(400);
      expect(res.json().error).toBe('bad_request');
    },
  );
});

describe('GET /checklists/:subjectId', () => {
  it('returns the tasks in order with the person looked up live', async () => {
    const s = await ready();
    const ann = await s.employee('ann.lee', { firstName: 'Ann', lastName: 'Lee' });
    s.checklists.seed(ann, ['Order laptop', 'Security training']);

    const res = await get(s, `/checklists/${ann}`);

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      subjectId: ann,
      status: 'open',
      templateName: null,
      completedAt: null,
      person: { displayName: 'Ann Lee', username: 'ann.lee' },
      items: [
        { title: 'Order laptop', position: 0, status: 'pending', completedAt: null },
        { title: 'Security training', position: 1, status: 'pending', completedAt: null },
      ],
    });
  });

  it('answers 404 for a subject with no checklist, and 400 for an id that is not a UUID', async () => {
    const s = await ready();

    const missing = await get(s, `/checklists/${MISSING}`);
    const malformed = await get(s, '/checklists/not-a-uuid');

    expect(missing.statusCode).toBe(404);
    expect(missing.json()).toEqual({ error: 'not_found', message: 'Checklist not found' });
    expect(malformed.statusCode).toBe(400);
  });
});

describe('PATCH /checklists/:subjectId/items/:itemId', () => {
  async function withChecklist(titles = ['Order laptop', 'Security training']) {
    const s = await ready();
    const subject = await s.employee('ann');
    const checklist = s.checklists.seed(subject, titles);
    const url = (index: number) => `/checklists/${subject}/items/${checklist.items[index]!.id}`;
    return { s, subject, checklist, url };
  }

  it('ticks a task, records who and when, and writes one audit row', async () => {
    const { s, subject, checklist, url } = await withChecklist();

    const res = await patch(s, url(0), { done: true }, ['hr-admin'], 'admin-7');

    expect(res.statusCode).toBe(200);
    expect(res.json().items[0]).toMatchObject({ status: 'done', completedAt: NOW.toISOString() });
    expect(res.json().items[1]).toMatchObject({ status: 'pending' });
    expect(res.json().status).toBe('open');
    expect(checklist.items[0]?.completedBy).toBe('admin-7');
    expect(s.audit.rows).toEqual([
      {
        actorId: 'admin-7',
        action: 'checklist.item_done',
        outcome: 'SUCCESS',
        targetSubjectId: subject,
        requestId: String(res.headers['x-request-id']),
        details: { itemId: checklist.items[0]!.id },
        createdAt: NOW,
      },
    ]);
  });

  it('completes the checklist when the last task is ticked, and reopens it when one is unticked', async () => {
    const { s, subject, url } = await withChecklist();

    await patch(s, url(0), { done: true });
    const finished = await patch(s, url(1), { done: true });
    const doneList = await get(s, '/checklists?status=done');
    const reopened = await patch(s, url(0), { done: false });
    const openList = await get(s, '/checklists?status=open');

    expect(finished.json()).toMatchObject({ status: 'done', completedAt: NOW.toISOString() });
    expect(doneList.json().items.map((item: { subjectId: string }) => item.subjectId)).toEqual([
      subject,
    ]);
    expect(openList.json().items.map((item: { subjectId: string }) => item.subjectId)).toEqual([
      subject,
    ]);
    expect(reopened.json()).toMatchObject({ status: 'open', completedAt: null });
    expect(reopened.json().items[0]).toMatchObject({ status: 'pending', completedAt: null });
    expect(s.audit.rows.map((row) => row.action)).toEqual([
      'checklist.item_done',
      'checklist.item_done',
      'checklist.item_undone',
    ]);
  });

  it('is idempotent in effect, and still writes an audit row for every successful request', async () => {
    const { s, url } = await withChecklist();

    const first = await patch(s, url(0), { done: true });
    const second = await patch(s, url(0), { done: true });

    expect(second.statusCode).toBe(200);
    expect(second.json()).toEqual(first.json());
    expect(s.audit.rows).toHaveLength(2);
  });

  it('rolls the tick back when its audit row cannot be written: item unchanged, no row, an error', async () => {
    const { s, subject, url } = await withChecklist();
    s.audit.failWrites = true;

    const res = await patch(s, url(0), { done: true });
    s.audit.failWrites = false;

    expect(res.statusCode).toBe(500);
    expect(res.json()).toEqual({ error: 'internal', message: 'Internal server error' });
    const detail = await get(s, `/checklists/${subject}`);
    expect(detail.json().items[0]).toMatchObject({ status: 'pending', completedAt: null });
    expect(s.audit.rows).toEqual([]);
  });

  it('answers 404 for a task that belongs to another checklist', async () => {
    const { s, subject } = await withChecklist();
    const other = s.checklists.seed(await s.employee('bob'), ['Other task']);

    const res = await patch(s, `/checklists/${subject}/items/${other.items[0]!.id}`, {
      done: true,
    });

    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: 'not_found', message: 'Checklist task not found' });
    expect(other.items[0]?.status).toBe('pending');
    expect(s.audit.rows).toEqual([]);
  });

  it('answers 404 for a task or a checklist that does not exist', async () => {
    const { s, subject, checklist } = await withChecklist();

    const noTask = await patch(s, `/checklists/${subject}/items/${MISSING}`, { done: true });
    const noChecklist = await patch(s, `/checklists/${MISSING}/items/${checklist.items[0]!.id}`, {
      done: true,
    });

    expect(noTask.statusCode).toBe(404);
    expect(noChecklist.statusCode).toBe(404);
    expect(noChecklist.json().message).toBe('Checklist not found');
    expect(s.audit.rows).toEqual([]);
  });

  it.each([
    ['no body', undefined],
    ['an empty body', {}],
    ['done as a string', { done: 'yes' }],
    ['done as a number', { done: 1 }],
  ])('rejects %s with 400 and changes nothing', async (_label, payload) => {
    const { s, subject, url } = await withChecklist();

    const res = await patch(s, url(0), payload);

    expect(res.statusCode).toBe(400);
    expect((await get(s, `/checklists/${subject}`)).json().items[0].status).toBe('pending');
    expect(s.audit.rows).toEqual([]);
  });

  it('rejects ids that are not UUIDs with 400', async () => {
    const { s, subject } = await withChecklist();

    const badSubject = await patch(s, `/checklists/x/items/${MISSING}`, { done: true });
    const badItem = await patch(s, `/checklists/${subject}/items/x`, { done: true });

    expect(badSubject.statusCode).toBe(400);
    expect(badItem.statusCode).toBe(400);
  });

  it('keeps names, emails and usernames out of the saved checklist and the audit rows', async () => {
    const s = await ready();
    const subject = await s.employee('ann.lee', { firstName: 'Ann', lastName: 'Lee' });
    const checklist = s.checklists.seed(subject, ['Order laptop']);

    await patch(s, `/checklists/${subject}/items/${checklist.items[0]!.id}`, { done: true });

    const stored = JSON.stringify([s.checklists.rows, s.audit.rows]);
    for (const personal of ['Ann', 'Lee', 'ann.lee', 'ann.lee@example.com']) {
      expect(stored).not.toContain(personal);
    }
  });
});
