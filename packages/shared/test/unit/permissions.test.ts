import { describe, expect, it } from 'vitest';
import { FEATURES, FEATURE_ACCESS, canAccess, hasAdminAccess } from '../../src/index';

const ADMIN_ROLES = ['super-admin', 'hr-admin'];

describe('permissions', () => {
  const adminFeatures = FEATURES.filter((feature) => FEATURE_ACCESS[feature] === 'admin');

  it.each(ADMIN_ROLES)('lets %s use every admin feature', (role) => {
    expect(hasAdminAccess([role, 'offline_access'], ADMIN_ROLES)).toBe(true);
    for (const feature of adminFeatures) {
      expect(canAccess([role], feature, ADMIN_ROLES, 'super-admin')).toBe(true);
    }
  });

  it('keeps the super-admin features to the configured super-admin role', () => {
    expect(canAccess(['super-admin'], 'onboard-assign-admin', ADMIN_ROLES, 'super-admin')).toBe(
      true,
    );
    expect(canAccess(['hr-admin'], 'onboard-assign-admin', ADMIN_ROLES, 'super-admin')).toBe(false);
    expect(canAccess(['it-owner'], 'onboard-assign-admin', ADMIN_ROLES, 'it-owner')).toBe(true);
    expect(canAccess(['super-admin'], 'onboard-assign-admin', ADMIN_ROLES, 'it-owner')).toBe(false);
  });

  it('denies a super-admin feature when no super-admin role is supplied', () => {
    expect(canAccess(['super-admin'], 'onboard-assign-admin', ADMIN_ROLES)).toBe(false);
  });

  it('gives nothing to a user without an admin role', () => {
    const roles = ['offline_access', 'uma_authorization', 'employee'];
    expect(hasAdminAccess(roles, ADMIN_ROLES)).toBe(false);
    for (const feature of FEATURES) {
      expect(canAccess(roles, feature, ADMIN_ROLES, 'super-admin')).toBe(false);
    }
  });

  it('gives nothing to a user with no roles at all', () => {
    expect(hasAdminAccess([], ADMIN_ROLES)).toBe(false);
    expect(canAccess([], 'employees', ADMIN_ROLES)).toBe(false);
  });

  it('is case sensitive, like role names in the token', () => {
    expect(hasAdminAccess(['HR-Admin'], ADMIN_ROLES)).toBe(false);
  });

  it('follows the configured admin roles, not a built-in list', () => {
    expect(canAccess(['it-admin'], 'employees', ['it-admin'])).toBe(true);
    expect(canAccess(['hr-admin'], 'employees', ['it-admin'])).toBe(false);
    expect(canAccess(['it-admin'], 'employees', [])).toBe(false);
  });

  it('defines a rule for every feature', () => {
    expect(Object.keys(FEATURE_ACCESS).sort()).toEqual([...FEATURES].sort());
  });
});
