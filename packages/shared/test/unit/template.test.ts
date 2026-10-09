import { describe, expect, it } from 'vitest';
import { templateSchema, templateViolation, type RolePolicy, type Template } from '../../src/index';

const policy: RolePolicy = {
  adminRoles: ['super-admin', 'hr-admin'],
  superAdminRole: 'super-admin',
};

type Item = Template['items'][number];

const item = (kind: Item['kind'], targetRef: string | null): Item => ({
  id: 'i',
  title: 't',
  description: null,
  kind,
  targetRef,
  position: 0,
});

const base = { defaultRole: null, items: [] as Item[] };

describe('templateSchema', () => {
  const valid = {
    id: 't1',
    name: 'Developer',
    description: null,
    departmentRef: '/Engineering',
    defaultRole: 'member',
    items: [
      item('GROUP_MEMBERSHIP', '/Sales'),
      item('ROLE', 'developer'),
      item('MANUAL_TASK', null),
    ],
  };

  it('accepts the three item kinds and a default role', () => {
    expect(templateSchema.safeParse(valid).success).toBe(true);
  });

  it.each([
    { defaultRole: 'owner' },
    { defaultRole: 'developer' },
    { items: [{ ...item('ROLE', 'x'), kind: 'REALM_ROLE' }] },
  ])('rejects %j', (override) => {
    expect(templateSchema.safeParse({ ...valid, ...override }).success).toBe(false);
  });
});

describe('templateViolation', () => {
  it('allows a template of ordinary roles, groups and tasks', () => {
    const items = [item('ROLE', 'developer'), item('GROUP_MEMBERSHIP', '/Sales')];

    expect(templateViolation({ ...base, items }, ['hr-admin'], policy)).toBeNull();
  });

  it('refuses owner for everyone', () => {
    const items = [item('ROLE', 'owner')];

    expect(templateViolation({ ...base, items }, ['super-admin'], policy)).toMatch(/owner/);
  });

  it('refuses admin-level roles for a non-super-admin only', () => {
    const items = [item('ROLE', 'hr-admin')];

    expect(templateViolation({ ...base, items }, ['hr-admin'], policy)).toMatch(
      /Only a super-admin/,
    );
    expect(templateViolation({ ...base, items }, ['super-admin'], policy)).toBeNull();
  });

  it('checks the default role as well', () => {
    const template = { ...base, defaultRole: 'admin' as const };

    expect(templateViolation(template, ['hr-admin'], policy)).toMatch(/Only a super-admin/);
    expect(templateViolation(template, ['super-admin'], policy)).toBeNull();
  });

  it('does not treat a group or a task named like a privileged role as a role', () => {
    const items = [item('GROUP_MEMBERSHIP', '/admin'), item('MANUAL_TASK', 'owner')];

    expect(templateViolation({ ...base, items }, ['hr-admin'], policy)).toBeNull();
  });
});
