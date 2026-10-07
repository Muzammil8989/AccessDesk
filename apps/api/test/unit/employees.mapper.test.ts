import type { IdentityUser } from '@accessdesk/identity';
import { describe, expect, it } from 'vitest';
import { toEmployee } from '../../src/modules/employees/employees.mapper';

const user = (overrides: Partial<IdentityUser> = {}): IdentityUser => ({
  subjectId: 'u1',
  username: 'ann',
  email: null,
  firstName: null,
  lastName: null,
  enabled: true,
  emailVerified: false,
  createdAt: null,
  ...overrides,
});

describe('toEmployee', () => {
  it('keeps missing optional fields as null', () => {
    expect(toEmployee(user())).toEqual({
      id: 'u1',
      username: 'ann',
      email: null,
      firstName: null,
      lastName: null,
      enabled: true,
      emailVerified: false,
      createdAt: null,
    });
  });

  it('converts the creation date to ISO 8601', () => {
    const employee = toEmployee(user({ createdAt: new Date(Date.UTC(2024, 0, 15, 12, 0, 0)) }));
    expect(employee.createdAt).toBe('2024-01-15T12:00:00.000Z');
  });
});
