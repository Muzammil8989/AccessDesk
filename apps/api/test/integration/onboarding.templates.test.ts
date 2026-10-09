import { createInMemoryIdentityProvider } from '@accessdesk/identity/testing';
import type { Template } from '@accessdesk/shared';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  bearer,
  buildTestApp,
  createAuthHarness,
  fakeTemplateRepository,
  type AuthHarness,
  type TestAppOptions,
} from '../helpers/harness';
import { InMemoryAuditRepository } from '../helpers/in-memory-audit';

let harness: AuthHarness;
beforeAll(async () => {
  harness = await createAuthHarness();
});

const TEMPLATE_ID = '5b0e7a43-1c3e-4b6e-9a58-0d2a4f6c8e01';
const OTHER_TEMPLATE_ID = '5b0e7a43-1c3e-4b6e-9a58-0d2a4f6c8e02';

type Item = Template['items'][number];
let position = 0;
const item = (kind: Item['kind'], targetRef: string | null): Item => ({
  id: `item-${(position += 1)}`,
  title: 'Item',
  description: null,
  kind,
  targetRef,
  position,
});

const developer = (extra: Item[] = []): Template => ({
  id: TEMPLATE_ID,
  name: 'Developer',
  description: null,
  departmentRef: '/Engineering',
  defaultRole: 'member',
  items: [
    item('GROUP_MEMBERSHIP', '/Sales'),
    item('ROLE', 'developer'),
    item('MANUAL_TASK', null),
    ...extra,
  ],
});

async function setup(templates: Template[], config?: TestAppOptions['config']) {
  const fake = createInMemoryIdentityProvider();
  const engineeringId = fake.seedGroup('Engineering');
  const salesId = fake.seedGroup('Sales');
  for (const role of ['member', 'manager', 'admin', 'developer', 'hr-admin']) fake.seedRole(role);
  const audit = new InMemoryAuditRepository();
  const app = await buildTestApp(harness, {
    identity: fake.provider,
    audit,
    templates: fakeTemplateRepository(templates),
    config,
  });
  const as = async (roles: string[], subject = 'admin-1') =>
    bearer(await harness.makeToken({ roles, subject }));
  const body = {
    firstName: 'Ann',
    lastName: 'Lee',
    email: 'ann@example.com',
    username: 'ann.lee',
    departmentGroupId: engineeringId,
    role: 'member',
    templateId: TEMPLATE_ID,
  };
  return { fake, audit, app, as, body, engineeringId, salesId };
}
type Setup = Awaited<ReturnType<typeof setup>>;

const open: Setup['app'][] = [];
afterEach(async () => {
  await Promise.all(open.splice(0).map((app) => app.close()));
});
async function ready(templates: Template[], config?: TestAppOptions['config']): Promise<Setup> {
  const s = await setup(templates, config);
  open.push(s.app);
  return s;
}

const post = async (s: Setup, roles: string[], payload: unknown) =>
  s.app.inject({
    method: 'POST',
    url: '/onboarding',
    headers: await s.as(roles),
    payload: payload as Record<string, unknown>,
  });

describe('POST /onboarding with a template', () => {
  it('answers 201 and applies the template groups and roles', async () => {
    const s = await ready([developer()]);

    const res = await post(s, ['hr-admin'], s.body);

    expect(res.statusCode).toBe(201);
    expect(res.json().steps).toEqual([
      { name: 'create_user', status: 'done' },
      { name: 'add_to_group', status: 'done' },
      { name: 'assign_role', status: 'done' },
      { name: 'template_add_to_group', status: 'done', label: '/Sales' },
      { name: 'template_assign_role', status: 'done', label: 'developer' },
      { name: 'create_checklist', status: 'done' },
    ]);
    expect(s.fake.inspect(res.json().subjectId)).toMatchObject({
      groupIds: [s.engineeringId, s.salesId],
      roleNames: ['member', 'developer'],
    });
    expect(s.audit.rows.map((row) => row.action)).toEqual([
      'onboarding.create_user',
      'onboarding.add_to_group',
      'onboarding.assign_role',
      'onboarding.template_add_to_group',
      'onboarding.template_assign_role',
      'onboarding.create_checklist',
    ]);
    expect(JSON.stringify(s.audit.rows)).not.toContain(res.json().temporaryPassword);
  });

  it('answers 207 when a template role does not exist, and Retry finishes it after the role is created', async () => {
    const s = await ready([developer([item('ROLE', 'ghost')])]);

    const first = await post(s, ['hr-admin'], s.body);

    expect(first.statusCode).toBe(207);
    expect(first.json().steps.find((step: { status: string }) => step.status === 'failed')).toEqual(
      {
        name: 'template_assign_role',
        status: 'failed',
        label: 'ghost',
        message: 'Role "ghost" does not exist in the identity provider',
      },
    );
    expect(first.json().temporaryPassword).toEqual(expect.any(String));
    s.fake.seedRole('ghost');
    const { subjectId } = first.json();

    const retry = await s.app.inject({
      method: 'POST',
      url: `/onboarding/${subjectId}/retry`,
      headers: await s.as(['hr-admin']),
      payload: {
        departmentGroupId: s.engineeringId,
        role: 'member',
        templateId: TEMPLATE_ID,
      },
    });

    expect(retry.statusCode).toBe(200);
    expect(retry.json()).not.toHaveProperty('temporaryPassword');
    expect(retry.json().steps.filter((step: { status: string }) => step.status === 'done')).toEqual(
      [
        { name: 'template_assign_role', status: 'done', label: 'ghost' },
        { name: 'create_checklist', status: 'done' },
      ],
    );
    expect(s.fake.callCount('createUser')).toBe(1);
  });

  it('answers 400 for a template that does not exist or is not a UUID, before creating anything', async () => {
    const s = await ready([developer()]);

    const unknown = await post(s, ['hr-admin'], { ...s.body, templateId: OTHER_TEMPLATE_ID });
    const malformed = await post(s, ['hr-admin'], { ...s.body, templateId: '../x' });

    expect(unknown.statusCode).toBe(400);
    expect(unknown.json()).toEqual({
      error: 'bad_request',
      message: 'The selected template does not exist',
    });
    expect(malformed.statusCode).toBe(400);
    expect(s.fake.callCount('createUser')).toBe(0);
  });

  it('rejects a member and an unauthenticated caller', async () => {
    const s = await ready([developer()]);

    const member = await post(s, ['member'], s.body);
    const anonymous = await s.app.inject({ method: 'POST', url: '/onboarding', payload: s.body });

    expect(member.statusCode).toBe(403);
    expect(anonymous.statusCode).toBe(401);
    expect(s.fake.callCount('createUser')).toBe(0);
  });
});

describe('template role safeguards over HTTP', () => {
  it.each(['owner', 'admin', 'hr-admin'])(
    'answers 403 for a template with %s when the caller is an hr-admin, and creates nothing',
    async (role) => {
      const s = await ready([developer([item('ROLE', role)])]);

      const res = await post(s, ['hr-admin'], s.body);

      expect(res.statusCode).toBe(403);
      expect(res.json().error).toBe('forbidden');
      expect(s.fake.callCount('createUser')).toBe(0);
      expect(s.audit.rows).toEqual([]);
    },
  );

  it('still refuses owner for a super-admin', async () => {
    const s = await ready([developer([item('ROLE', 'owner')])]);

    const res = await post(s, ['super-admin'], s.body);

    expect(res.statusCode).toBe(403);
    expect(res.json().message).toMatch(/owner role cannot be assigned/);
  });

  it.each(['admin', 'hr-admin'])('lets a super-admin apply a template with %s', async (role) => {
    const s = await ready([developer([item('ROLE', role)])]);

    const res = await post(s, ['super-admin'], s.body);

    expect(res.statusCode).toBe(201);
    expect(s.fake.inspect(res.json().subjectId)?.roleNames).toContain(role);
  });

  it('refuses the super-admin role itself for everyone', async () => {
    const s = await ready([developer([item('ROLE', 'super-admin')])]);

    const res = await post(s, ['super-admin'], s.body);

    expect(res.statusCode).toBe(403);
    expect(s.fake.callCount('createUser')).toBe(0);
  });

  it('refuses a retry when the stored template now holds a role the caller may not assign', async () => {
    const templates = [developer()];
    const s = await ready(templates);
    const first = await post(s, ['hr-admin'], s.body);
    templates[0]!.items.push(item('ROLE', 'admin'));

    const retry = await s.app.inject({
      method: 'POST',
      url: `/onboarding/${first.json().subjectId}/retry`,
      headers: await s.as(['hr-admin']),
      payload: { departmentGroupId: s.engineeringId, role: 'member', templateId: TEMPLATE_ID },
    });

    expect(retry.statusCode).toBe(403);
    expect(retry.json().message).toBe('Only a super-admin can assign the admin role');
  });
});

describe('the role chosen on the form, over HTTP', () => {
  const config = { adminRoles: ['super-admin', 'hr-admin', 'manager'] };

  it('refuses a role that AUTH_ADMIN_ROLES makes privileged, on create and on retry', async () => {
    const s = await ready([], config);
    const first = await post(s, ['hr-admin'], { ...s.body, templateId: undefined });

    const create = await post(s, ['hr-admin'], {
      ...s.body,
      templateId: undefined,
      role: 'manager',
      username: 'second',
      email: 'second@example.com',
    });
    const retry = await s.app.inject({
      method: 'POST',
      url: `/onboarding/${first.json().subjectId}/retry`,
      headers: await s.as(['hr-admin']),
      payload: { departmentGroupId: s.engineeringId, role: 'manager' },
    });

    expect(create.statusCode).toBe(403);
    expect(create.json().message).toBe('Only a super-admin can assign the manager role');
    expect(retry.statusCode).toBe(403);
  });

  it('lets a super-admin assign it', async () => {
    const s = await ready([], config);

    const res = await post(s, ['super-admin'], {
      ...s.body,
      templateId: undefined,
      role: 'manager',
    });

    expect(res.statusCode).toBe(201);
  });

  it('refuses a form role that is the configured super-admin role, even for its holder', async () => {
    const s = await ready([], { adminRoles: ['hr-admin', 'admin'], superAdminRole: 'admin' });

    const res = await post(s, ['admin'], { ...s.body, templateId: undefined, role: 'admin' });

    expect(res.statusCode).toBe(403);
    expect(s.fake.callCount('createUser')).toBe(0);
  });
});

describe('GET /templates', () => {
  it('returns the department, the default role and the item targets', async () => {
    const s = await ready([developer()]);

    const res = await s.app.inject({ url: '/templates', headers: await s.as(['hr-admin']) });

    expect(res.statusCode).toBe(200);
    expect(res.json().items[0]).toMatchObject({
      id: TEMPLATE_ID,
      departmentRef: '/Engineering',
      defaultRole: 'member',
      items: [
        { kind: 'GROUP_MEMBERSHIP', targetRef: '/Sales' },
        { kind: 'ROLE', targetRef: 'developer' },
        { kind: 'MANUAL_TASK', targetRef: null },
      ],
    });
  });
});
