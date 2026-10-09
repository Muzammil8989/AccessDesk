import { IdentityProviderError, type IdentityProvider } from '@accessdesk/identity';
import { createInMemoryIdentityProvider } from '@accessdesk/identity/testing';
import type { OnboardEmployee, Template } from '@accessdesk/shared';
import { describe, expect, it, vi } from 'vitest';
import { AppError } from '../../src/errors';
import { OnboardingService, type Caller } from '../../src/modules/onboarding/onboarding.service';
import { fakeTemplateRepository } from '../helpers/harness';
import { InMemoryAuditRepository } from '../helpers/in-memory-audit';
import { InMemoryChecklistRepository } from '../helpers/in-memory-checklists';

const TEMPLATE_ID = '5b0e7a43-1c3e-4b6e-9a58-0d2a4f6c8e01';
const NOW = new Date('2026-10-09T10:00:00.000Z');

const developer: Template = {
  id: TEMPLATE_ID,
  name: 'Developer',
  description: null,
  departmentRef: '/Engineering',
  defaultRole: 'member',
  items: [
    {
      id: 'i1',
      title: 'Order laptop',
      description: null,
      kind: 'MANUAL_TASK',
      targetRef: null,
      position: 1,
    },
  ],
};

async function setup(wrap?: (provider: IdentityProvider) => IdentityProvider) {
  const fake = createInMemoryIdentityProvider();
  const engineeringId = fake.seedGroup('Engineering');
  for (const role of ['member', 'manager', 'admin']) fake.seedRole(role);
  const managerId = await fake.provider.createUser({ username: 'boss', email: 'boss@example.com' });
  const audit = new InMemoryAuditRepository(() => NOW);
  const checklists = new InMemoryChecklistRepository(audit);
  const service = new OnboardingService({
    identity: wrap ? wrap(fake.provider) : fake.provider,
    audit,
    templates: fakeTemplateRepository([developer]),
    checklists,
    clock: () => NOW,
    generatePassword: () => 'Pw-Secret-1234567',
    adminRoles: ['super-admin', 'hr-admin'],
    superAdminRole: 'super-admin',
  });
  const input: OnboardEmployee = {
    firstName: 'Ann',
    lastName: 'Lee',
    email: 'ann@example.com',
    username: 'ann.lee',
    departmentGroupId: engineeringId,
    role: 'member',
  };
  const caller = (actorId = 'admin-1'): Caller => ({
    actorId,
    roles: ['hr-admin'],
    requestId: 'req-1',
    log: { warn: vi.fn(), error: vi.fn() },
  });
  const retryInput = (extra: Record<string, unknown> = {}) => ({
    departmentGroupId: engineeringId,
    role: 'member' as const,
    ...extra,
  });
  return { fake, audit, checklists, service, input, caller, managerId, retryInput };
}

const names = (steps: { name: string }[]) => steps.map((step) => step.name);

describe('the checklist step for a manager or a start date', () => {
  it('creates an open checklist for a manager alone, with no template and no tasks', async () => {
    const s = await setup();

    const result = await s.service.onboard(
      { ...s.input, managerSubjectId: s.managerId },
      s.caller(),
    );

    expect(result.status).toBe('complete');
    expect(names(result.steps)).toEqual([
      'create_user',
      'add_to_group',
      'assign_role',
      'create_checklist',
    ]);
    expect(s.checklists.rows).toHaveLength(1);
    expect(s.checklists.rows[0]).toMatchObject({
      subjectId: result.subjectId,
      templateId: null,
      managerSubjectId: s.managerId,
      startDate: null,
      status: 'open',
      completedAt: null,
      items: [],
    });
  });

  it('creates an open checklist for a start date alone', async () => {
    const s = await setup();

    const result = await s.service.onboard({ ...s.input, startDate: '2026-10-20' }, s.caller());

    expect(names(result.steps)).toContain('create_checklist');
    expect(s.checklists.rows[0]).toMatchObject({
      managerSubjectId: null,
      startDate: '2026-10-20',
      status: 'open',
      items: [],
    });
  });

  it('never creates an empty checklist as done', async () => {
    const s = await setup();

    await s.service.onboard(
      { ...s.input, managerSubjectId: s.managerId, startDate: '2026-10-20' },
      s.caller(),
    );

    expect(s.checklists.rows.map((row) => [row.status, row.completedAt])).toEqual([['open', null]]);
  });

  it('keeps the tasks, the manager and the start date together when all three are given', async () => {
    const s = await setup();

    await s.service.onboard(
      {
        ...s.input,
        templateId: TEMPLATE_ID,
        managerSubjectId: s.managerId,
        startDate: '2026-10-20',
      },
      s.caller(),
    );

    expect(s.checklists.rows[0]).toMatchObject({
      templateId: TEMPLATE_ID,
      managerSubjectId: s.managerId,
      startDate: '2026-10-20',
      items: [{ title: 'Order laptop' }],
    });
  });

  it('adds no step and creates no checklist when there is nothing to put in one', async () => {
    const s = await setup();

    const result = await s.service.onboard(s.input, s.caller());

    expect(names(result.steps)).not.toContain('create_checklist');
    expect(s.checklists.rows).toEqual([]);
  });

  it('writes one audit row with the subject ids and the date, and nothing personal', async () => {
    const s = await setup();

    const result = await s.service.onboard(
      { ...s.input, managerSubjectId: s.managerId, startDate: '2026-10-20' },
      s.caller(),
    );

    const row = s.audit.rows.find((entry) => entry.action === 'onboarding.create_checklist');
    expect(row).toMatchObject({
      outcome: 'SUCCESS',
      targetSubjectId: result.subjectId,
      details: { taskCount: '0', managerSubjectId: s.managerId, startDate: '2026-10-20' },
    });
    const stored = JSON.stringify([s.audit.rows, s.checklists.rows]);
    for (const personal of ['Ann', 'Lee', 'ann@example.com', 'ann.lee', 'boss', 'Pw-Secret']) {
      expect(stored).not.toContain(personal);
    }
  });

  it('does not delay or disable the account because of the start date', async () => {
    const s = await setup();

    const result = await s.service.onboard({ ...s.input, startDate: '2030-01-01' }, s.caller());

    expect(await s.fake.provider.getUser(result.subjectId)).toMatchObject({ enabled: true });
    expect(s.fake.inspect(result.subjectId)?.roleNames).toEqual(['member']);
  });

  it('is skipped on retry once the checklist exists, and never makes a second one', async () => {
    const s = await setup();
    const first = await s.service.onboard(
      { ...s.input, managerSubjectId: s.managerId },
      s.caller(),
    );

    const again = await s.service.retry(
      first.subjectId,
      s.retryInput({ managerSubjectId: s.managerId }),
      s.caller(),
    );

    expect(again.steps.at(-1)).toEqual({
      name: 'create_checklist',
      status: 'skipped',
      message: 'Already done',
    });
    expect(s.checklists.rows).toHaveLength(1);
  });

  it('fails as a partial result when it cannot be saved, and Retry creates it with the same manager and date', async () => {
    const s = await setup();
    s.checklists.failCreate = true;
    const first = await s.service.onboard(
      { ...s.input, managerSubjectId: s.managerId, startDate: '2026-10-20' },
      s.caller(),
    );
    expect(first.status).toBe('partial');
    s.checklists.failCreate = false;

    const retried = await s.service.retry(
      first.subjectId,
      s.retryInput({ managerSubjectId: s.managerId, startDate: '2026-10-20' }),
      s.caller(),
    );

    expect(retried.status).toBe('complete');
    expect(s.checklists.rows[0]).toMatchObject({
      managerSubjectId: s.managerId,
      startDate: '2026-10-20',
      status: 'open',
    });
  });
});

describe('checking the manager', () => {
  const refusal = async (s: Awaited<ReturnType<typeof setup>>, managerSubjectId: string) =>
    s.service
      .onboard({ ...s.input, managerSubjectId }, s.caller())
      .catch((error: unknown) => error);

  it('refuses a manager that does not exist, with unknown_manager, before creating anything', async () => {
    const s = await setup();

    const error = await refusal(s, '00000000-0000-4000-8000-0000000000ff');

    expect(error).toBeInstanceOf(AppError);
    expect(error).toMatchObject({
      statusCode: 400,
      code: 'unknown_manager',
      message: 'The selected manager was not found',
    });
    expect(s.fake.callCount('createUser')).toBe(1);
    expect(s.audit.rows).toEqual([]);
    expect(s.checklists.rows).toEqual([]);
  });

  it('refuses a disabled manager, with manager_disabled, before creating anything', async () => {
    const s = await setup();
    await s.fake.provider.disableUser(s.managerId);

    const error = await refusal(s, s.managerId);

    expect(error).toMatchObject({
      statusCode: 400,
      code: 'manager_disabled',
      message: "The selected manager's account is disabled",
    });
    expect(s.fake.callCount('createUser')).toBe(1);
    expect(s.audit.rows).toEqual([]);
  });

  it('accepts an enabled manager and asks the identity provider once', async () => {
    const s = await setup();
    const before = s.fake.callCount('getUser');

    await s.service.onboard({ ...s.input, managerSubjectId: s.managerId }, s.caller());

    expect(s.fake.callCount('getUser') - before).toBe(1);
  });

  it('does not ask about a manager when none is given', async () => {
    const s = await setup();
    const before = s.fake.callCount('getUser');

    await s.service.onboard(s.input, s.caller());

    expect(s.fake.callCount('getUser')).toBe(before);
  });

  it('passes a provider failure through instead of calling the manager unknown', async () => {
    const s = await setup((provider) => ({
      ...provider,
      getUser: async () => {
        throw new IdentityProviderError(403, 'no permission');
      },
    }));

    const error = await refusal(s, s.managerId);

    expect(error).toBeInstanceOf(IdentityProviderError);
    expect(error).toMatchObject({ status: 403 });
    expect(s.fake.callCount('createUser')).toBe(1);
  });

  it('checks the manager again on retry while the checklist is missing', async () => {
    const s = await setup();
    s.checklists.failCreate = true;
    const first = await s.service.onboard(
      { ...s.input, managerSubjectId: s.managerId },
      s.caller(),
    );
    s.checklists.failCreate = false;
    await s.fake.provider.disableUser(s.managerId);

    const error = await s.service
      .retry(first.subjectId, s.retryInput({ managerSubjectId: s.managerId }), s.caller())
      .catch((e: unknown) => e);

    expect(error).toMatchObject({ statusCode: 400, code: 'manager_disabled' });
  });

  it('does not check the manager on retry once the checklist exists', async () => {
    const s = await setup();
    const first = await s.service.onboard(
      { ...s.input, managerSubjectId: s.managerId },
      s.caller(),
    );
    await s.fake.provider.disableUser(s.managerId);

    const retried = await s.service.retry(
      first.subjectId,
      s.retryInput({ managerSubjectId: s.managerId }),
      s.caller(),
    );

    expect(retried.status).toBe('complete');
  });
});
