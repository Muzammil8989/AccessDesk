import { describe, expect, it } from 'vitest';
import { FEATURES, FEATURE_ROLES, canAccess, hasAdminAccess } from '../../src/index';

describe('permissions', () => {
  it.each(['super-admin', 'hr-admin'])('lets %s use AccessDesk', (role) => {
    expect(hasAdminAccess([role, 'offline_access'])).toBe(true);
    for (const feature of FEATURES) expect(canAccess([role], feature)).toBe(true);
  });

  it('gives nothing to a user without an admin role', () => {
    const roles = ['offline_access', 'uma_authorization', 'employee'];
    expect(hasAdminAccess(roles)).toBe(false);
    for (const feature of FEATURES) expect(canAccess(roles, feature)).toBe(false);
  });

  it('gives nothing to a user with no roles at all', () => {
    expect(hasAdminAccess([])).toBe(false);
    expect(canAccess([], 'employees')).toBe(false);
  });

  it('is case sensitive, like Keycloak role names', () => {
    expect(hasAdminAccess(['HR-Admin'])).toBe(false);
  });

  it('defines a rule for every feature', () => {
    expect(Object.keys(FEATURE_ROLES).sort()).toEqual([...FEATURES].sort());
  });
});
