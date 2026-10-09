import { describe, expect, it } from 'vitest';
import {
  ADMIN_ROLE_REASON,
  canAssignRole,
  onboardEmployeeSchema,
  onboardResultSchema,
  onboardingOptionsSchema,
  onboardingSubjectParamsSchema,
  retryOnboardingSchema,
  roleOptions,
  type RolePolicy,
} from '../../src/index';

const policy: RolePolicy = {
  adminRoles: ['super-admin', 'hr-admin'],
  superAdminRole: 'super-admin',
};

const valid = {
  firstName: 'Ann',
  lastName: 'Lee',
  email: 'ann@example.com',
  username: 'ann.lee',
  departmentGroupId: 'group-1',
  role: 'member',
};

describe('onboardEmployeeSchema', () => {
  it('accepts a valid employee', () => {
    expect(onboardEmployeeSchema.parse(valid)).toEqual(valid);
  });

  it('trims names and lowercases email and username', () => {
    const parsed = onboardEmployeeSchema.parse({
      ...valid,
      firstName: '  Ann ',
      lastName: ' Lee  ',
      email: '  Ann@Example.COM ',
      username: ' Ann.Lee ',
    });

    expect(parsed).toMatchObject({
      firstName: 'Ann',
      lastName: 'Lee',
      email: 'ann@example.com',
      username: 'ann.lee',
    });
  });

  it.each(['', '   ', 'a'.repeat(81), 'Ann\u0000', 'An\nn', 'A\u007fnn'])(
    'rejects a first name that is blank, too long or has control characters (%j)',
    (firstName) => {
      expect(onboardEmployeeSchema.safeParse({ ...valid, firstName }).success).toBe(false);
    },
  );

  it('accepts a name of exactly 80 characters', () => {
    expect(onboardEmployeeSchema.safeParse({ ...valid, lastName: 'a'.repeat(80) }).success).toBe(
      true,
    );
  });

  it.each(['not-an-email', 'ann@', '@example.com', ''])('rejects the email %j', (email) => {
    expect(onboardEmployeeSchema.safeParse({ ...valid, email }).success).toBe(false);
  });

  it.each(['ab', 'a'.repeat(65), 'ann lee', 'ann/lee', 'ann@lee', 'änn'])(
    'rejects the username %j',
    (username) => {
      expect(onboardEmployeeSchema.safeParse({ ...valid, username }).success).toBe(false);
    },
  );

  it.each(['abc', 'a.b_c-d', 'a'.repeat(64), '123'])('accepts the username %j', (username) => {
    expect(onboardEmployeeSchema.safeParse({ ...valid, username }).success).toBe(true);
  });

  it('accepts an optional template id and rejects one that is not a UUID', () => {
    const templateId = '8b1c5f5e-7a62-4a0a-9a52-2f1b8f8c1e11';
    expect(onboardEmployeeSchema.parse({ ...valid, templateId })).toEqual({ ...valid, templateId });
    expect(onboardEmployeeSchema.safeParse({ ...valid, templateId: '../x' }).success).toBe(false);
  });

  it('requires a department', () => {
    expect(onboardEmployeeSchema.safeParse({ ...valid, departmentGroupId: '' }).success).toBe(
      false,
    );
  });

  it.each(['member', 'manager', 'admin'])('accepts the role %s', (role) => {
    expect(onboardEmployeeSchema.safeParse({ ...valid, role }).success).toBe(true);
  });

  it.each(['owner', 'super-admin', '', 'Member'])('rejects the role %j', (role) => {
    expect(onboardEmployeeSchema.safeParse({ ...valid, role }).success).toBe(false);
  });

  it('rejects missing fields', () => {
    expect(onboardEmployeeSchema.safeParse({}).success).toBe(false);
  });
});

describe('retryOnboardingSchema', () => {
  it('needs only a department, a role and the optional template, and never allows owner', () => {
    expect(retryOnboardingSchema.parse({ departmentGroupId: 'g', role: 'manager' })).toEqual({
      departmentGroupId: 'g',
      role: 'manager',
    });
    const templateId = '8b1c5f5e-7a62-4a0a-9a52-2f1b8f8c1e11';
    expect(
      retryOnboardingSchema.parse({ departmentGroupId: 'g', role: 'manager', templateId }),
    ).toEqual({ departmentGroupId: 'g', role: 'manager', templateId });
    expect(retryOnboardingSchema.safeParse({ departmentGroupId: 'g', role: 'owner' }).success).toBe(
      false,
    );
  });
});

describe('onboardingSubjectParamsSchema', () => {
  it('requires a UUID', () => {
    expect(
      onboardingSubjectParamsSchema.safeParse({ subjectId: '8b1c5f5e-7a62-4a0a-9a52-2f1b8f8c1e11' })
        .success,
    ).toBe(true);
    expect(onboardingSubjectParamsSchema.safeParse({ subjectId: '../x' }).success).toBe(false);
  });
});

describe('onboardResultSchema', () => {
  it('accepts a complete result with a password', () => {
    expect(
      onboardResultSchema.safeParse({
        status: 'complete',
        subjectId: 's1',
        steps: [{ name: 'create_user', status: 'done' }],
        temporaryPassword: 'abc',
      }).success,
    ).toBe(true);
  });

  it('accepts a partial result with a failed step message and no password', () => {
    expect(
      onboardResultSchema.safeParse({
        status: 'partial',
        subjectId: 's1',
        steps: [
          { name: 'create_user', status: 'done' },
          { name: 'add_to_group', status: 'failed', message: 'nope' },
          { name: 'assign_role', status: 'skipped' },
        ],
      }).success,
    ).toBe(true);
  });

  it('accepts the template and checklist steps, with an optional label', () => {
    expect(
      onboardResultSchema.safeParse({
        status: 'partial',
        subjectId: 's1',
        steps: [
          { name: 'template_add_to_group', status: 'done', label: '/Engineering' },
          { name: 'template_assign_role', status: 'failed', label: 'developer', message: 'nope' },
          { name: 'create_checklist', status: 'skipped' },
        ],
      }).success,
    ).toBe(true);
  });

  it.each([
    { status: 'unknown', subjectId: 's', steps: [] },
    { status: 'complete', subjectId: '', steps: [] },
    { status: 'complete', subjectId: 's', steps: [{ name: 'other', status: 'done' }] },
    { status: 'complete', subjectId: 's', steps: [{ name: 'create_user', status: 'maybe' }] },
  ])('rejects a malformed result %#', (body) => {
    expect(onboardResultSchema.safeParse(body).success).toBe(false);
  });
});

describe('onboardingOptionsSchema', () => {
  it('accepts departments and role options', () => {
    expect(
      onboardingOptionsSchema.safeParse({
        departments: [{ id: 'g1', name: 'Engineering', path: '/Engineering' }],
        roles: roleOptions(['hr-admin'], policy),
      }).success,
    ).toBe(true);
  });
});

describe('role policy', () => {
  it('lets anyone assign member and manager', () => {
    expect(canAssignRole([], 'member', policy)).toBe(true);
    expect(canAssignRole(['hr-admin'], 'manager', policy)).toBe(true);
  });

  it('lets only the configured super-admin role assign admin', () => {
    expect(canAssignRole(['super-admin'], 'admin', policy)).toBe(true);
    expect(canAssignRole(['hr-admin'], 'admin', policy)).toBe(false);
    expect(canAssignRole(['super-admin'], 'admin', { ...policy, superAdminRole: 'it-owner' })).toBe(
      false,
    );
    expect(canAssignRole(['it-owner'], 'admin', { ...policy, superAdminRole: 'it-owner' })).toBe(
      true,
    );
  });

  it('describes every role, with a reason only when one is not allowed', () => {
    expect(roleOptions(['hr-admin'], policy)).toEqual([
      { name: 'member', allowed: true },
      { name: 'manager', allowed: true },
      { name: 'admin', allowed: false, reason: ADMIN_ROLE_REASON },
    ]);
    expect(roleOptions(['super-admin'], policy).every((role) => role.allowed)).toBe(true);
  });

  it('also refuses a form role that the configuration makes privileged', () => {
    const odd: RolePolicy = { adminRoles: ['manager'], superAdminRole: 'super-admin' };
    expect(roleOptions(['hr-admin'], odd)).toEqual([
      { name: 'member', allowed: true },
      { name: 'manager', allowed: false, reason: 'Only a super-admin can assign the manager role' },
      { name: 'admin', allowed: false, reason: ADMIN_ROLE_REASON },
    ]);
  });
});
