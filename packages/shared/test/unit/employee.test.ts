import { describe, expect, it } from 'vitest';
import { employeeIdParamsSchema, employeeListSchema, templateListSchema } from '../../src/index';

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
        items: [{ id: 't1', name: 'Dev', description: null, items: [] }],
      }).success,
    ).toBe(true);
  });
});
