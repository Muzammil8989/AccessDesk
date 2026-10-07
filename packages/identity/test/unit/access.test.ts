import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ADMIN_ROLES,
  DEFAULT_ROLES_CLAIM_PATH,
  loadAccessPolicy,
  readRolesFromClaims,
} from '../../src/index';

describe('loadAccessPolicy', () => {
  it('defaults to the standard admin roles and claim path', () => {
    expect(loadAccessPolicy({})).toEqual({
      adminRoles: [...DEFAULT_ADMIN_ROLES],
      rolesClaimPath: DEFAULT_ROLES_CLAIM_PATH,
    });
  });

  it('reads custom values, ignoring spaces around role names', () => {
    expect(
      loadAccessPolicy({
        AUTH_ADMIN_ROLES: ' it-admin , people-ops ',
        AUTH_ROLES_CLAIM_PATH: 'resource_access.accessdesk.roles',
      }),
    ).toEqual({
      adminRoles: ['it-admin', 'people-ops'],
      rolesClaimPath: 'resource_access.accessdesk.roles',
    });
  });

  it.each(['', '  ', 'hr-admin,', 'hr-admin,,super-admin'])(
    'rejects an admin role list with a blank entry (%j)',
    (value) => {
      expect(() => loadAccessPolicy({ AUTH_ADMIN_ROLES: value })).toThrow('AUTH_ADMIN_ROLES');
    },
  );

  it.each(['', '.roles', 'realm_access.', 'realm_access..roles'])(
    'rejects a claim path with an empty segment (%j)',
    (value) => {
      expect(() => loadAccessPolicy({ AUTH_ROLES_CLAIM_PATH: value })).toThrow(
        'AUTH_ROLES_CLAIM_PATH',
      );
    },
  );

  it('names the invalid variables but never echoes their values', () => {
    expect(() => loadAccessPolicy({ AUTH_ADMIN_ROLES: 'a,,secret-value' })).toThrow(
      /^Invalid access configuration: AUTH_ADMIN_ROLES$/,
    );
  });
});

describe('readRolesFromClaims', () => {
  const path = 'resource_access.accessdesk.roles';

  it('reads the roles at the path', () => {
    const claims = { resource_access: { accessdesk: { roles: ['hr-admin', 'x'] } } };
    expect(readRolesFromClaims(claims, path)).toEqual(['hr-admin', 'x']);
  });

  it('reads a single-segment path', () => {
    expect(readRolesFromClaims({ roles: ['a'] }, 'roles')).toEqual(['a']);
  });

  it('treats a claim that is absent anywhere along the path as no roles', () => {
    for (const claims of [{}, { resource_access: {} }, { resource_access: { accessdesk: {} } }]) {
      expect(readRolesFromClaims(claims, path)).toEqual([]);
    }
  });

  it.each<[string, object]>([
    ['roles that are not a list', { realm_access: { roles: 'hr-admin' } }],
    ['roles that are not strings', { realm_access: { roles: [1, 2] } }],
    ['a parent that is not an object', { realm_access: 'hr-admin' }],
    ['a parent that is a list', { realm_access: ['hr-admin'] }],
    ['a null parent', { realm_access: null }],
  ])('throws for %s', (_name, claims) => {
    expect(() => readRolesFromClaims(claims, DEFAULT_ROLES_CLAIM_PATH)).toThrow();
  });

  it('does not follow inherited properties', () => {
    expect(readRolesFromClaims({ realm_access: { roles: ['a'] } }, 'constructor.name')).toEqual([]);
  });
});
