import { describe, expect, it } from 'vitest';
import { ADMIN_ROLE_REASON, roleViolation, type RolePolicy } from '../../src/index';

const policy: RolePolicy = {
  adminRoles: ['super-admin', 'hr-admin'],
  superAdminRole: 'super-admin',
};

describe('roleViolation', () => {
  it.each(['developer', 'sales', 'member', 'manager'])('allows the ordinary role %s', (role) => {
    expect(roleViolation(role, ['hr-admin'], policy)).toBeNull();
  });

  it.each(['owner', 'Owner', 'OWNER'])('never allows %s, even for a super-admin', (role) => {
    expect(roleViolation(role, ['super-admin'], policy)).toMatch(/owner role cannot be assigned/);
  });

  it.each(['super-admin', 'Super-Admin'])(
    'never allows the super-admin role itself (%s), even for a super-admin',
    (role) => {
      expect(roleViolation(role, ['super-admin'], policy)).toMatch(
        /cannot be assigned through onboarding/,
      );
    },
  );

  it.each(['admin', 'Admin', 'hr-admin', 'HR-ADMIN'])(
    'allows %s only for a super-admin, whatever the case',
    (role) => {
      expect(roleViolation(role, ['hr-admin'], policy)).toBe(
        `Only a super-admin can assign the ${role} role`,
      );
      expect(roleViolation(role, ['super-admin'], policy)).toBeNull();
    },
  );

  it('uses the shared reason text for admin', () => {
    expect(roleViolation('admin', ['hr-admin'], policy)).toBe(ADMIN_ROLE_REASON);
  });

  it('follows the configured role names, not the literal default', () => {
    const custom: RolePolicy = {
      adminRoles: ['it-owner', 'people-team'],
      superAdminRole: 'it-owner',
    };
    expect(roleViolation('super-admin', ['people-team'], custom)).toBeNull();
    expect(roleViolation('people-team', ['people-team'], custom)).toMatch(/Only a super-admin/);
    expect(roleViolation('it-owner', ['it-owner'], custom)).toMatch(/cannot be assigned/);
  });

  it('does not treat a caller who only holds an admin role as a super-admin', () => {
    expect(roleViolation('admin', ['hr-admin', 'member'], policy)).not.toBeNull();
  });
});
