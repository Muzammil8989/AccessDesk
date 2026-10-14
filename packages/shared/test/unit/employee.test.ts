import { describe, expect, it } from 'vitest';
import {
  employeeFilterOptionsSchema,
  employeeIdParamsSchema,
  employeeListSchema,
  listEmployeesQuerySchema,
  templateListSchema,
} from '../../src/index';

describe('employeeIdParamsSchema', () => {
  it('accepts a UUID', () => {
    expect(
      employeeIdParamsSchema.safeParse({ id: '8b1c5f5e-7a62-4a0a-9a52-2f1b8f8c1e11' }).success,
    ).toBe(true);
  });

  it.each(['../master', 'admin', '', '8b1c5f5e/7a62'])('rejects %j', (id) => {
    expect(employeeIdParamsSchema.safeParse({ id }).success).toBe(false);
  });
});

describe('response schemas', () => {
  it('accepts an empty employee list', () => {
    expect(employeeListSchema.safeParse({ items: [], total: 0, first: 0, max: 20 }).success).toBe(
      true,
    );
  });

  it('rejects an employee list with a negative total', () => {
    expect(employeeListSchema.safeParse({ items: [], total: -1, first: 0, max: 20 }).success).toBe(
      false,
    );
  });

  it('accepts a template list', () => {
    expect(
      templateListSchema.safeParse({
        items: [
          {
            id: 't1',
            name: 'Dev',
            description: null,
            departmentRef: '/Engineering',
            defaultRole: 'member',
            items: [],
          },
        ],
      }).success,
    ).toBe(true);
  });
});

describe('listEmployeesQuerySchema', () => {
  const parse = (query: Record<string, unknown>) => listEmployeesQuerySchema.safeParse(query);

  it('defaults to the first page of 20, with no filters', () => {
    expect(parse({})).toMatchObject({ success: true, data: { first: 0, max: 20 } });
    const data = parse({}).data;
    expect(data?.enabled).toBeUndefined();
    expect(data?.groupId).toBeUndefined();
    expect(data?.role).toBeUndefined();
  });

  it.each([
    ['true', true],
    ['false', false],
  ])('reads enabled=%s as the boolean %s', (text, expected) => {
    expect(parse({ enabled: text }).data?.enabled).toBe(expected);
  });

  it.each(['yes', '1', '0', 'TRUE', '', 'undefined'])('rejects enabled=%j', (text) => {
    expect(parse({ enabled: text }).success).toBe(false);
  });

  it('trims a group id and a role name', () => {
    expect(parse({ groupId: '  g1  ' }).data?.groupId).toBe('g1');
    expect(parse({ role: '  developer ' }).data?.role).toBe('developer');
  });

  it.each([
    ['an empty group id', { groupId: '' }],
    ['a blank group id', { groupId: '   ' }],
    ['an empty role', { role: '' }],
    ['a group id over 100 characters', { groupId: 'g'.repeat(101) }],
    ['a role over 100 characters', { role: 'r'.repeat(101) }],
  ])('rejects %s', (_label, query) => {
    expect(parse(query).success).toBe(false);
  });

  it('refuses a group and a role together, and says which filters clash', () => {
    const result = parse({ groupId: 'g1', role: 'developer' });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]).toMatchObject({
      path: ['groupId'],
      message: 'Filter by a group or by a role, not both',
    });
  });

  it('accepts a group or a role on its own, with the other filters', () => {
    expect(parse({ groupId: 'g1', enabled: 'false', search: 'ann' }).success).toBe(true);
    expect(parse({ role: 'developer', enabled: 'true' }).success).toBe(true);
  });

  it('keeps the page size at 100 and the offset at zero or more', () => {
    expect(parse({ max: '100' }).success).toBe(true);
    expect(parse({ max: '101' }).success).toBe(false);
    expect(parse({ max: '0' }).success).toBe(false);
    expect(parse({ first: '-1' }).success).toBe(false);
  });
});

describe('employee list and filter option responses', () => {
  it('treats a list without a capped flag as complete', () => {
    const parsed = employeeListSchema.parse({ items: [], total: 0, first: 0, max: 20 });

    expect(parsed.capped).toBe(false);
  });

  it('carries the capped flag when the list was cut short', () => {
    const parsed = employeeListSchema.parse({
      items: [],
      total: 2000,
      capped: true,
      first: 0,
      max: 20,
    });

    expect(parsed.capped).toBe(true);
  });

  it('accepts filter options of groups and roles, and nothing else about them', () => {
    const options = {
      groups: [{ id: 'g1', name: 'Engineering' }],
      roles: [{ name: 'developer' }],
    };

    expect(employeeFilterOptionsSchema.parse(options)).toEqual(options);
    expect(employeeFilterOptionsSchema.safeParse({ groups: [], roles: [{}] }).success).toBe(false);
  });
});
