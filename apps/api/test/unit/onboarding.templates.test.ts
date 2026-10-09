import { IdentityProviderError, type IdentityProvider } from '@accessdesk/identity';
import { createInMemoryIdentityProvider } from '@accessdesk/identity/testing';
import type { OnboardEmployee, Template } from '@accessdesk/shared';
import { describe, expect, it, vi } from 'vitest';
import { AppError } from '../../src/errors';
import { OnboardingService, type Caller } from '../../src/modules/onboarding/onboarding.service';
import { fakeTemplateRepository } from '../helpers/harness';
import { InMemoryAuditRepository } from '../helpers/in-memory-audit';

const TEMPLATE_ID = '5b0e7a43-1c3e-4b6e-9a58-0d2a4f6c8e01';
const PASSWORD = 'Pw-Secret-1234567';
const NOW = new Date('2026-10-09T10:00:00.000Z');

type Item = Template['items'][number];

let itemCounter = 0;
function item(kind: Item['kind'], targetRef: string | null, title = 'Item'): Item {
  itemCounter += 1;
  return {
    id: `item-${itemCounter}`,
    title,
    description: null,
    kind,
    targetRef,
    position: itemCounter,
  };
}

function template(items: Item[], overrides: Partial<Template> = {}): Template {
  return {
    id: TEMPLATE_ID,
    name: 'Developer',
    description: null,
    departmentRef: '/Engineering',
    defaultRole: 'member',
    items,
    ...overrides,
  };
}

function failOnCall(
  provider: IdentityProvider,
  method: 'createUser' | 'addUserToGroup' | 'addUserRoles' | 'listRoles',
  nth: number,
  error: Error = new IdentityProviderError(500, 'boom'),
): IdentityProvider {
  let calls = 0;
  const original = provider[method].bind(provider) as (...args: unknown[]) => Promise<unknown>;
  return {
    ...provider,
    [method]: async (...args: unknown[]) => {
      calls += 1;
      if (calls === nth) throw error;
      return original(...args);
    },
  };
}

interface SetupOptions {
  template?: Template;
  wrap?: (provider: IdentityProvider) => IdentityProvider;
  adminRoles?: string[];
  superAdminRole?: string;
  seed?: { groups?: string[]; roles?: string[] };
}

function setup(options: SetupOptions = {}) {
  const fake = createInMemoryIdentityProvider();
  const engineeringId = fake.seedGroup('Engineering');
  const salesId = fake.seedGroup('Sales');
  for (const group of options.seed?.groups ?? []) fake.seedGroup(group);
  for (const role of ['member', 'manager', 'admin', 'developer', 'hr-admin', 'super-admin']) {
    fake.seedRole(role);
  }
  for (const role of options.seed?.roles ?? []) fake.seedRole(role);

  const audit = new InMemoryAuditRepository(() => NOW);
  const templates = fakeTemplateRepository(options.template ? [options.template] : []);
  const service = new OnboardingService({
    identity: options.wrap ? options.wrap(fake.provider) : fake.provider,
    audit,
    templates,
    clock: () => NOW,
    generatePassword: () => PASSWORD,
    adminRoles: options.adminRoles ?? ['super-admin', 'hr-admin'],
    superAdminRole: options.superAdminRole ?? 'super-admin',
  });
  const input: OnboardEmployee = {
    firstName: 'Ann',
    lastName: 'Lee',
    email: 'ann@example.com',
    username: 'ann.lee',
    departmentGroupId: engineeringId,
    role: 'member',
    templateId: TEMPLATE_ID,
  };
  const caller = (roles: string[] = ['hr-admin'], actorId = 'admin-1'): Caller => ({
    actorId,
    roles,
    requestId: 'req-1',
    log: { warn: vi.fn(), error: vi.fn() },
  });
  return { fake, audit, service, input, caller, engineeringId, salesId };
}

const statuses = (steps: { name: string; status: string }[]) =>
  steps.map((step) => `${step.name}:${step.status}`);

describe('applying a template', () => {
  const standard = () =>
    template([
      item('GROUP_MEMBERSHIP', '/Sales'),
      item('ROLE', 'developer'),
      item('MANUAL_TASK', null, 'Order laptop'),
    ]);

  it('adds the template groups and roles after the three existing steps and never runs a manual task', async () => {
    const s = setup({ template: standard() });

    const result = await s.service.onboard(s.input, s.caller());

    expect(result.status).toBe('complete');
    expect(result.steps).toEqual([
      { name: 'create_user', status: 'done' },
      { name: 'add_to_group', status: 'done' },
      { name: 'assign_role', status: 'done' },
      { name: 'template_add_to_group', status: 'done', label: '/Sales' },
      { name: 'template_assign_role', status: 'done', label: 'developer' },
    ]);
    expect(s.fake.inspect(result.subjectId)).toMatchObject({
      groupIds: [s.engineeringId, s.salesId],
      roleNames: ['member', 'developer'],
    });
  });

  it('writes one audit row per step and never a password', async () => {
    const s = setup({ template: standard() });

    const result = await s.service.onboard(s.input, s.caller(['hr-admin'], 'admin-7'));

    expect(s.audit.rows.map((row) => [row.action, row.outcome, row.targetSubjectId])).toEqual([
      ['onboarding.create_user', 'SUCCESS', result.subjectId],
      ['onboarding.add_to_group', 'SUCCESS', result.subjectId],
      ['onboarding.assign_role', 'SUCCESS', result.subjectId],
      ['onboarding.template_add_to_group', 'SUCCESS', result.subjectId],
      ['onboarding.template_assign_role', 'SUCCESS', result.subjectId],
    ]);
    expect(s.audit.rows[3]?.details).toEqual({
      templateId: TEMPLATE_ID,
      itemId: expect.any(String),
      groupPath: '/Sales',
      groupId: s.salesId,
    });
    expect(s.audit.rows[4]?.details).toEqual({
      templateId: TEMPLATE_ID,
      itemId: expect.any(String),
      role: 'developer',
    });
    expect(JSON.stringify(s.audit.rows)).not.toContain(PASSWORD);
    expect(JSON.stringify(s.audit.rows)).not.toContain('ann@example.com');
  });

  it('adds nothing for a template that has only manual tasks', async () => {
    const s = setup({ template: template([item('MANUAL_TASK', null)]) });

    const result = await s.service.onboard(s.input, s.caller());

    expect(statuses(result.steps)).toEqual([
      'create_user:done',
      'add_to_group:done',
      'assign_role:done',
    ]);
  });

  it('does not add the department group twice or assign the role chosen on the form twice', async () => {
    const s = setup({
      template: template([
        item('GROUP_MEMBERSHIP', '/Engineering'),
        item('ROLE', 'MEMBER'),
        item('GROUP_MEMBERSHIP', '/Sales'),
        item('GROUP_MEMBERSHIP', '/Sales'),
        item('ROLE', 'developer'),
        item('ROLE', 'Developer'),
      ]),
    });

    const result = await s.service.onboard(s.input, s.caller());

    expect(statuses(result.steps)).toEqual([
      'create_user:done',
      'add_to_group:done',
      'assign_role:done',
      'template_add_to_group:done',
      'template_assign_role:done',
    ]);
    expect(s.fake.callCount('addUserToGroup')).toBe(2);
    expect(s.fake.callCount('addUserRoles')).toBe(2);
  });

  it('assigns the provider spelling of a role whose case differs from the template', async () => {
    const s = setup({
      template: template([item('ROLE', 'qa-lead')]),
      seed: { roles: ['QA-Lead'] },
    });

    const result = await s.service.onboard(s.input, s.caller());

    expect(result.status).toBe('complete');
    expect(s.fake.inspect(result.subjectId)?.roleNames).toContain('QA-Lead');
  });

  it('loads the role list once however many role items there are', async () => {
    const s = setup({
      template: template([item('ROLE', 'developer'), item('ROLE', 'hr-admin')]),
    });

    await s.service.onboard(s.input, s.caller(['super-admin']));

    expect(s.fake.callCount('listRoles')).toBe(1);
  });

  it('works without a template exactly as before', async () => {
    const s = setup();

    const result = await s.service.onboard({ ...s.input, templateId: undefined }, s.caller());

    expect(statuses(result.steps)).toEqual([
      'create_user:done',
      'add_to_group:done',
      'assign_role:done',
    ]);
    expect(s.fake.callCount('listRoles')).toBe(0);
  });

  it('refuses an unknown template with a 400 before creating anything', async () => {
    const s = setup();

    const error = await s.service.onboard(s.input, s.caller()).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(AppError);
    expect(error).toMatchObject({
      statusCode: 400,
      message: 'The selected template does not exist',
    });
    expect(s.fake.callCount('createUser')).toBe(0);
    expect(s.audit.rows).toEqual([]);
  });
});

describe('a step failing', () => {
  const standard = () => template([item('GROUP_MEMBERSHIP', '/Sales'), item('ROLE', 'developer')]);

  it.each([
    {
      label: 'the department group',
      wrap: (p: IdentityProvider) => failOnCall(p, 'addUserToGroup', 1),
      expected: [
        'create_user:done',
        'add_to_group:failed',
        'assign_role:skipped',
        'template_add_to_group:skipped',
        'template_assign_role:skipped',
      ],
    },
    {
      label: 'the form role',
      wrap: (p: IdentityProvider) => failOnCall(p, 'addUserRoles', 1),
      expected: [
        'create_user:done',
        'add_to_group:done',
        'assign_role:failed',
        'template_add_to_group:skipped',
        'template_assign_role:skipped',
      ],
    },
    {
      label: 'the template group',
      wrap: (p: IdentityProvider) => failOnCall(p, 'addUserToGroup', 2),
      expected: [
        'create_user:done',
        'add_to_group:done',
        'assign_role:done',
        'template_add_to_group:failed',
        'template_assign_role:skipped',
      ],
    },
    {
      label: 'the template role',
      wrap: (p: IdentityProvider) => failOnCall(p, 'addUserRoles', 2),
      expected: [
        'create_user:done',
        'add_to_group:done',
        'assign_role:done',
        'template_add_to_group:done',
        'template_assign_role:failed',
      ],
    },
  ])(
    'gives a partial result, no rollback and a failure row when $label fails',
    async ({ wrap, expected }) => {
      const s = setup({ template: standard(), wrap });

      const result = await s.service.onboard(s.input, s.caller());

      expect(result.status).toBe('partial');
      expect(result.temporaryPassword).toBe(PASSWORD);
      expect(statuses(result.steps)).toEqual(expected);
      expect(await s.fake.provider.findUsers({ username: 'ann.lee', exact: true })).toHaveLength(1);
      expect(s.fake.callCount('disableUser')).toBe(0);
      const failures = s.audit.rows.filter((row) => row.outcome === 'FAILURE');
      expect(failures).toHaveLength(1);
      expect(failures[0]?.targetSubjectId).toBe(result.subjectId);
    },
  );

  it('throws instead of answering partial when the user itself cannot be created', async () => {
    const s = setup({
      template: standard(),
      wrap: (p) => failOnCall(p, 'createUser', 1, new IdentityProviderError(503, 'down')),
    });

    await expect(s.service.onboard(s.input, s.caller())).rejects.toBeInstanceOf(
      IdentityProviderError,
    );
    expect(s.audit.rows.map((row) => [row.action, row.outcome])).toEqual([
      ['onboarding.create_user', 'FAILURE'],
    ]);
  });

  it('says which permission may be missing when the role list is refused', async () => {
    const s = setup({
      template: standard(),
      wrap: (p) => failOnCall(p, 'listRoles', 1, new IdentityProviderError(403, 'forbidden')),
    });

    const result = await s.service.onboard(s.input, s.caller());

    expect(result.steps.at(-1)).toMatchObject({
      name: 'template_assign_role',
      status: 'failed',
      message: 'The identity provider refused this step. Your account may be missing a permission.',
    });
  });
});

describe('retry with a template', () => {
  const standard = () => template([item('GROUP_MEMBERSHIP', '/Sales'), item('ROLE', 'developer')]);

  it.each([
    {
      label: 'the template group',
      failAt: 'addUserToGroup' as const,
      callsLeft: { addUserToGroup: 2, addUserRoles: 2 },
      retried: ['template_add_to_group:done', 'template_assign_role:done'],
      skipped: 3,
    },
    {
      label: 'the template role',
      failAt: 'addUserRoles' as const,
      callsLeft: { addUserToGroup: 2, addUserRoles: 2 },
      retried: ['template_assign_role:done'],
      skipped: 4,
    },
  ])(
    'runs only the template step that failed ($label) and skips everything done',
    async ({ failAt, callsLeft, retried, skipped }) => {
      const s = setup({ template: standard(), wrap: (p) => failOnCall(p, failAt, 2) });
      const first = await s.service.onboard(s.input, s.caller());
      expect(first.status).toBe('partial');

      const { templateId, departmentGroupId, role } = s.input;
      const result = await s.service.retry(
        first.subjectId,
        { templateId, departmentGroupId, role },
        s.caller(),
      );

      expect(result.status).toBe('complete');
      expect(result).not.toHaveProperty('temporaryPassword');
      const byStatus = statuses(result.steps);
      expect(byStatus.filter((step) => step.endsWith(':done'))).toEqual(retried);
      expect(byStatus.filter((step) => step.endsWith(':skipped'))).toHaveLength(skipped);
      expect(s.fake.callCount('addUserToGroup')).toBe(callsLeft.addUserToGroup);
      expect(s.fake.callCount('addUserRoles')).toBe(callsLeft.addUserRoles);
      expect(s.fake.callCount('createUser')).toBe(1);
    },
  );

  it('is idempotent once everything is in place', async () => {
    const s = setup({ template: standard() });
    const first = await s.service.onboard(s.input, s.caller());
    const { templateId, departmentGroupId, role } = s.input;
    const rows = s.audit.rows.length;

    const again = await s.service.retry(
      first.subjectId,
      { templateId, departmentGroupId, role },
      s.caller(),
    );

    expect(again.steps.every((step) => step.status === 'skipped')).toBe(true);
    expect(s.audit.rows).toHaveLength(rows);
  });

  it('still needs the create_user success row from the same actor', async () => {
    const s = setup({ template: standard() });
    const first = await s.service.onboard(s.input, s.caller());
    const { templateId, departmentGroupId, role } = s.input;

    await expect(
      s.service.retry(
        first.subjectId,
        { templateId, departmentGroupId, role },
        s.caller(['hr-admin'], 'other'),
      ),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('checks the template again against the caller, even if it was saved earlier', async () => {
    const stored = standard();
    const s = setup({ template: stored });
    const first = await s.service.onboard(s.input, s.caller());
    stored.items.push(item('ROLE', 'admin'));
    const { templateId, departmentGroupId, role } = s.input;

    const error = await s.service
      .retry(first.subjectId, { templateId, departmentGroupId, role }, s.caller())
      .catch((e: unknown) => e);

    expect(error).toMatchObject({
      statusCode: 403,
      message: 'Only a super-admin can assign the admin role',
    });
  });
});

describe('names that do not exist in the identity provider', () => {
  it('fails only the group step, with a clear message, and Retry works after the group is created', async () => {
    const s = setup({ template: template([item('GROUP_MEMBERSHIP', '/Nowhere')]) });

    const first = await s.service.onboard(s.input, s.caller());

    expect(first.status).toBe('partial');
    expect(first.steps.at(-1)).toEqual({
      name: 'template_add_to_group',
      status: 'failed',
      label: '/Nowhere',
      message: 'Group "/Nowhere" does not exist in the identity provider',
    });
    s.fake.seedGroup('Nowhere');
    const { templateId, departmentGroupId, role } = s.input;

    const retried = await s.service.retry(
      first.subjectId,
      { templateId, departmentGroupId, role },
      s.caller(),
    );

    expect(retried.status).toBe('complete');
    expect(retried.steps.filter((step) => step.status === 'done')).toEqual([
      { name: 'template_add_to_group', status: 'done', label: '/Nowhere' },
    ]);
    expect(s.fake.callCount('createUser')).toBe(1);
  });

  it('says that only top-level groups are supported for a nested path', async () => {
    const s = setup({ template: template([item('GROUP_MEMBERSHIP', '/Engineering/Backend')]) });

    const result = await s.service.onboard(s.input, s.caller());

    expect(result.steps.at(-1)?.message).toBe(
      'Group "/Engineering/Backend" does not exist in the identity provider (only top-level groups are supported)',
    );
  });

  it('fails only the role step, with a clear message, and Retry works after the role is created', async () => {
    const s = setup({ template: template([item('ROLE', 'ghost')]) });

    const first = await s.service.onboard(s.input, s.caller());

    expect(first.status).toBe('partial');
    expect(first.steps.at(-1)).toEqual({
      name: 'template_assign_role',
      status: 'failed',
      label: 'ghost',
      message: 'Role "ghost" does not exist in the identity provider',
    });
    expect(s.audit.rows.at(-1)).toMatchObject({
      action: 'onboarding.template_assign_role',
      outcome: 'FAILURE',
    });
    s.fake.seedRole('ghost');
    const { templateId, departmentGroupId, role } = s.input;

    const retried = await s.service.retry(
      first.subjectId,
      { templateId, departmentGroupId, role },
      s.caller(),
    );

    expect(retried.status).toBe('complete');
    expect(s.fake.inspect(first.subjectId)?.roleNames).toContain('ghost');
  });

  it.each([
    [
      'a group item with no target',
      item('GROUP_MEMBERSHIP', null),
      'This template item does not name a group',
    ],
    ['a role item with no target', item('ROLE', null), 'This template item does not name a role'],
  ])('fails the step for %s', async (_label, broken, message) => {
    const s = setup({ template: template([broken]) });

    const result = await s.service.onboard(s.input, s.caller());

    expect(result.steps.at(-1)).toMatchObject({ status: 'failed', message });
  });
});

describe('role safeguards at apply time', () => {
  const withRole = (role: string, overrides: Partial<Template> = {}) =>
    template([item('ROLE', role)], overrides);

  async function refusal(setupOptions: SetupOptions, roles: string[]) {
    const s = setup(setupOptions);
    const error = await s.service.onboard(s.input, s.caller(roles)).catch((e: unknown) => e);
    return { s, error };
  }

  it.each(['owner', 'Owner', 'OWNER'])('never assigns %s, even for a super-admin', async (role) => {
    const { s, error } = await refusal({ template: withRole(role) }, ['super-admin']);

    expect(error).toMatchObject({ statusCode: 403 });
    expect((error as Error).message).toMatch(/owner role cannot be assigned/);
    expect(s.fake.callCount('createUser')).toBe(0);
    expect(s.audit.rows).toEqual([]);
  });

  it.each(['admin', 'Admin', 'hr-admin', 'HR-ADMIN'])(
    'refuses %s for a non-super-admin before creating anything',
    async (role) => {
      const { s, error } = await refusal({ template: withRole(role) }, ['hr-admin']);

      expect(error).toMatchObject({
        statusCode: 403,
        message: `Only a super-admin can assign the ${role} role`,
      });
      expect(s.fake.callCount('createUser')).toBe(0);
      expect(s.audit.rows).toEqual([]);
    },
  );

  it.each(['admin', 'hr-admin'])('lets a super-admin apply a template with %s', async (role) => {
    const s = setup({ template: withRole(role) });

    const result = await s.service.onboard(s.input, s.caller(['super-admin']));

    expect(result.status).toBe('complete');
    expect(s.fake.inspect(result.subjectId)?.roleNames).toContain(role);
  });

  it('never assigns the super-admin role itself, even for a super-admin', async () => {
    const { s, error } = await refusal({ template: withRole('super-admin') }, ['super-admin']);

    expect(error).toMatchObject({ statusCode: 403 });
    expect((error as Error).message).toMatch(/super-admin role cannot be assigned/);
    expect(s.fake.callCount('createUser')).toBe(0);
  });

  it('refuses a template whose default role is privileged', async () => {
    const { error } = await refusal({ template: withRole('developer', { defaultRole: 'admin' }) }, [
      'hr-admin',
    ]);

    expect(error).toMatchObject({ statusCode: 403 });
  });

  it('follows the configured role names', async () => {
    const options = {
      template: withRole('people-team'),
      adminRoles: ['it-owner', 'people-team'],
      superAdminRole: 'it-owner',
      seed: { roles: ['people-team'] },
    };

    const refused = await refusal(options, ['people-team']);
    const allowed = setup(options);
    const result = await allowed.service.onboard(allowed.input, allowed.caller(['it-owner']));

    expect(refused.error).toMatchObject({ statusCode: 403 });
    expect(result.status).toBe('complete');
  });
});

describe('role safeguards on the role chosen on the form', () => {
  it('refuses admin for a non-super-admin on create and on retry', async () => {
    const s = setup({ template: template([]) });
    const created = await s.service.onboard(s.input, s.caller());

    const create = s.service.onboard({ ...s.input, role: 'admin' }, s.caller());
    const retry = s.service.retry(
      created.subjectId,
      { templateId: TEMPLATE_ID, departmentGroupId: s.input.departmentGroupId, role: 'admin' },
      s.caller(),
    );

    await expect(create).rejects.toMatchObject({ statusCode: 403 });
    await expect(retry).rejects.toMatchObject({ statusCode: 403 });
  });

  it('refuses a form role that AUTH_ADMIN_ROLES makes privileged, on create and on retry', async () => {
    const s = setup({ adminRoles: ['super-admin', 'hr-admin', 'manager'] });
    const created = await s.service.onboard({ ...s.input, templateId: undefined }, s.caller());
    const body = { departmentGroupId: s.input.departmentGroupId, role: 'manager' as const };

    await expect(
      s.service.onboard({ ...s.input, templateId: undefined, role: 'manager' }, s.caller()),
    ).rejects.toMatchObject({
      statusCode: 403,
      message: 'Only a super-admin can assign the manager role',
    });
    await expect(s.service.retry(created.subjectId, body, s.caller())).rejects.toMatchObject({
      statusCode: 403,
    });
    const allowed = await s.service.onboard(
      {
        ...s.input,
        templateId: undefined,
        role: 'manager',
        username: 'second',
        email: 'b@example.com',
      },
      s.caller(['super-admin']),
    );
    expect(allowed.status).toBe('complete');
  });

  it('refuses a form role that is the super-admin role, even for its holder', async () => {
    const s = setup({ adminRoles: ['hr-admin', 'admin'], superAdminRole: 'admin' });

    await expect(
      s.service.onboard({ ...s.input, templateId: undefined, role: 'admin' }, s.caller(['admin'])),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(s.fake.callCount('createUser')).toBe(0);
  });
});

describe('getOptions', () => {
  it('lists departments with their group path and describes every role for the caller', async () => {
    const s = setup({ adminRoles: ['super-admin', 'hr-admin', 'manager'] });

    const options = await s.service.getOptions({ roles: ['hr-admin'] });

    expect(options.departments).toEqual([
      { id: s.engineeringId, name: 'Engineering', path: '/Engineering' },
      { id: s.salesId, name: 'Sales', path: '/Sales' },
    ]);
    expect(options.roles.map((role) => [role.name, role.allowed])).toEqual([
      ['member', true],
      ['manager', false],
      ['admin', false],
    ]);
  });
});
