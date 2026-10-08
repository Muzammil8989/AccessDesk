import { IdentityProviderError } from '@accessdesk/identity';
import { createInMemoryIdentityProvider } from '@accessdesk/identity/testing';
import { describe, expect, it, vi } from 'vitest';
import { createAuditingObserver } from '../../src/modules/onboarding/onboarding.audit';
import {
  describeStepFailure,
  runSteps,
  type OnboardingStep,
  type StepContext,
  type StepObserver,
} from '../../src/modules/onboarding/onboarding.runner';
import {
  addToGroupStep,
  assignRoleStep,
  createUserStep,
  existingUserStep,
  requireSubject,
} from '../../src/modules/onboarding/onboarding.steps';
import { InMemoryAuditRepository } from '../helpers/in-memory-audit';

function step(name: OnboardingStep['name'], run: () => Promise<void>, satisfied = false) {
  return { name, satisfied, run, details: () => ({}) } satisfies OnboardingStep;
}

function recordingObserver() {
  const events: string[] = [];
  const observer: StepObserver = {
    succeeded: async (s) => void events.push(`ok:${s.name}`),
    failed: async (s) => void events.push(`fail:${s.name}`),
  };
  return { observer, events };
}

describe('runSteps', () => {
  it('runs the steps in order and reports each as done', async () => {
    const order: string[] = [];
    const { observer, events } = recordingObserver();

    const outcome = await runSteps(
      [
        step('create_user', async () => void order.push('a')),
        step('add_to_group', async () => void order.push('b')),
        step('assign_role', async () => void order.push('c')),
      ],
      { subjectId: null },
      observer,
    );

    expect(order).toEqual(['a', 'b', 'c']);
    expect(outcome.failure).toBeUndefined();
    expect(outcome.results.map((r) => r.status)).toEqual(['done', 'done', 'done']);
    expect(events).toEqual(['ok:create_user', 'ok:add_to_group', 'ok:assign_role']);
  });

  it('stops at the first failure and marks the rest as not run', async () => {
    const later = vi.fn();
    const { observer, events } = recordingObserver();
    const boom = new IdentityProviderError(500, 'boom');

    const outcome = await runSteps(
      [
        step('create_user', async () => undefined),
        step('add_to_group', async () => Promise.reject(boom)),
        step('assign_role', async () => later()),
      ],
      { subjectId: null },
      observer,
    );

    expect(later).not.toHaveBeenCalled();
    expect(outcome.failure).toEqual({ step: 'add_to_group', error: boom });
    expect(outcome.results).toEqual([
      { name: 'create_user', status: 'done' },
      {
        name: 'add_to_group',
        status: 'failed',
        message: 'The identity provider could not complete this step.',
      },
      { name: 'assign_role', status: 'skipped', message: 'Not run because an earlier step failed' },
    ]);
    expect(events).toEqual(['ok:create_user', 'fail:add_to_group']);
  });

  it('skips a satisfied step without running or observing it', async () => {
    const run = vi.fn();
    const { observer, events } = recordingObserver();

    const outcome = await runSteps(
      [step('create_user', async () => run(), true), step('assign_role', async () => undefined)],
      { subjectId: 'x' },
      observer,
    );

    expect(run).not.toHaveBeenCalled();
    expect(outcome.results).toEqual([
      { name: 'create_user', status: 'skipped', message: 'Already done' },
      { name: 'assign_role', status: 'done' },
    ]);
    expect(events).toEqual(['ok:assign_role']);
  });
});

describe('describeStepFailure', () => {
  it.each([
    [
      new IdentityProviderError(403, 'x'),
      'The identity provider refused this step. Your account may be missing a permission.',
    ],
    [
      new IdentityProviderError(404, 'x'),
      'The identity provider could not find what this step needs.',
    ],
    [new IdentityProviderError(500, 'x'), 'The identity provider could not complete this step.'],
    [new Error('internal detail'), 'This step failed unexpectedly.'],
    ['a string', 'This step failed unexpectedly.'],
  ])('describes %j without leaking internals', (error, message) => {
    expect(describeStepFailure(error)).toBe(message);
  });
});

describe('onboarding steps', () => {
  async function fixture() {
    const fake = createInMemoryIdentityProvider();
    const groupId = fake.seedGroup('Sales');
    fake.seedRole('member');
    return { fake, groupId, department: { id: groupId, name: 'Sales' } };
  }

  const employee = {
    firstName: 'Ann',
    lastName: 'Lee',
    email: 'ann@example.com',
    username: 'ann.lee',
    departmentGroupId: 'unused',
    role: 'member' as const,
  };

  it('creates an enabled user with a verified email and a temporary password', async () => {
    const { fake } = await fixture();
    const context: StepContext = { subjectId: null };

    await createUserStep(fake.provider, employee, 'Temp-pass-123').run(context);

    expect(fake.inspect(requireSubject(context))?.initialPassword).toEqual({
      value: 'Temp-pass-123',
      temporary: true,
    });
    expect(await fake.provider.getUser(requireSubject(context))).toMatchObject({
      enabled: true,
      emailVerified: true,
    });
  });

  it('adds to the group and assigns the role for the user in the context', async () => {
    const { fake, department } = await fixture();
    const subjectId = await fake.provider.createUser({ username: 'ann' });

    await addToGroupStep(fake.provider, department, false).run({ subjectId });
    await assignRoleStep(fake.provider, 'member', false).run({ subjectId });

    expect(fake.inspect(subjectId)).toMatchObject({
      groupIds: [department.id],
      roleNames: ['member'],
    });
  });

  it('refuses to act before a user exists', async () => {
    const { fake, department } = await fixture();

    await expect(
      addToGroupStep(fake.provider, department, false).run({ subjectId: null }),
    ).rejects.toThrow('The user has not been created yet');
  });

  it('describes only ids, the group name and the role name for the audit log', async () => {
    const { fake, department } = await fixture();

    expect(createUserStep(fake.provider, employee, 'x').details()).toEqual({});
    expect(addToGroupStep(fake.provider, department, false).details()).toEqual({
      groupId: department.id,
      groupName: 'Sales',
    });
    expect(assignRoleStep(fake.provider, 'member', false).details()).toEqual({ role: 'member' });
  });

  it('marks an existing user as already created', async () => {
    const step = existingUserStep();

    expect(step.satisfied).toBe(true);
    await expect(step.run({ subjectId: 'x' })).resolves.toBeUndefined();
  });
});

describe('createAuditingObserver', () => {
  const context: StepContext = { subjectId: 'subject-1' };
  const addToGroup = {
    name: 'add_to_group',
    satisfied: false,
    run: async () => undefined,
    details: () => ({ groupId: 'g1', groupName: 'Sales' }),
  } satisfies OnboardingStep;

  it('records a success row for a step that worked', async () => {
    const audit = new InMemoryAuditRepository();
    const log = { warn: vi.fn(), error: vi.fn() };

    await createAuditingObserver({ audit, log, actorId: 'a1', requestId: 'r1' }).succeeded(
      addToGroup,
      context,
    );

    expect(audit.rows).toMatchObject([
      {
        actorId: 'a1',
        action: 'onboarding.add_to_group',
        outcome: 'SUCCESS',
        targetSubjectId: 'subject-1',
        requestId: 'r1',
        details: { groupId: 'g1', groupName: 'Sales' },
      },
    ]);
    expect(log.warn).not.toHaveBeenCalled();
  });

  it('records a failure row and logs the step and provider status without any body', async () => {
    const audit = new InMemoryAuditRepository();
    const log = { warn: vi.fn(), error: vi.fn() };

    await createAuditingObserver({ audit, log, actorId: 'a1', requestId: 'r1' }).failed(
      addToGroup,
      context,
      new IdentityProviderError(403, 'secret detail'),
    );

    expect(audit.rows).toMatchObject([{ outcome: 'FAILURE' }]);
    expect(log.warn).toHaveBeenCalledWith(
      { requestId: 'r1', step: 'add_to_group', identityProviderStatus: 403 },
      'Onboarding step failed',
    );
  });

  it('logs no provider status for an error that did not come from the provider', async () => {
    const audit = new InMemoryAuditRepository();
    const log = { warn: vi.fn(), error: vi.fn() };

    await createAuditingObserver({ audit, log, actorId: 'a1', requestId: 'r1' }).failed(
      addToGroup,
      context,
      new Error('x'),
    );

    expect(log.warn).toHaveBeenCalledWith(
      { requestId: 'r1', step: 'add_to_group', identityProviderStatus: undefined },
      'Onboarding step failed',
    );
  });

  it('survives a failing audit store and logs only the request id and the error name', async () => {
    const log = { warn: vi.fn(), error: vi.fn() };
    const audit = {
      record: vi.fn().mockRejectedValue(new TypeError('connection string with a secret')),
      hasSuccessSince: vi.fn(),
    };

    await expect(
      createAuditingObserver({ audit, log, actorId: 'a1', requestId: 'r1' }).succeeded(
        addToGroup,
        context,
      ),
    ).resolves.toBeUndefined();

    expect(log.error).toHaveBeenCalledWith(
      { requestId: 'r1', action: 'onboarding.add_to_group', errorName: 'TypeError' },
      'Audit log write failed',
    );
  });

  it('copes with something other than an Error being thrown by the store', async () => {
    const log = { warn: vi.fn(), error: vi.fn() };
    const audit = { record: vi.fn().mockRejectedValue('nope'), hasSuccessSince: vi.fn() };

    await createAuditingObserver({ audit, log, actorId: 'a1', requestId: 'r1' }).succeeded(
      { ...addToGroup, details: () => ({}) },
      { subjectId: null },
    );

    expect(log.error).toHaveBeenCalledWith(
      { requestId: 'r1', action: 'onboarding.add_to_group', errorName: 'unknown' },
      'Audit log write failed',
    );
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ targetSubjectId: undefined, details: undefined }),
    );
  });
});
