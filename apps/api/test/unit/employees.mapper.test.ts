import { describe, expect, it } from 'vitest';
import { toEmployee } from '../../src/modules/employees/employees.mapper';

describe('toEmployee', () => {
  it('maps missing optional fields to null', () => {
    expect(toEmployee({ id: 'u1', username: 'ann', enabled: true, emailVerified: false })).toEqual({
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

  it('converts the Keycloak timestamp to ISO 8601', () => {
    const employee = toEmployee({
      id: 'u1',
      username: 'ann',
      enabled: true,
      emailVerified: true,
      createdTimestamp: Date.UTC(2024, 0, 15, 12, 0, 0),
    });
    expect(employee.createdAt).toBe('2024-01-15T12:00:00.000Z');
  });
});
