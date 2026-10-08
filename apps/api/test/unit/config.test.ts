import { describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/config';

const valid = {
  IDENTITY_ISSUER_URL: 'http://localhost:8080/realms/company-platform/',
  IDENTITY_CLIENT_ID: 'accessdesk',
  DATABASE_URL: 'postgresql://user:secret-pass@localhost:5432/accessdesk',
};

describe('loadConfig', () => {
  it('takes the issuer without a trailing slash and defaults the audience to the client ID', () => {
    const config = loadConfig(valid);
    expect(config.issuer).toBe('http://localhost:8080/realms/company-platform');
    expect(config.audience).toBe('accessdesk');
  });

  it('has safe defaults: loopback only, no proxy trust, a rate limit', () => {
    const config = loadConfig(valid);
    expect(config.port).toBe(4000);
    expect(config.host).toBe('127.0.0.1');
    expect(config.trustProxy).toBe(false);
    expect(config.rateLimitPerMinute).toBe(300);
  });

  describe('identity provider', () => {
    it('defaults to the first supported provider', () => {
      expect(loadConfig(valid).identityProvider).toBe('keycloak');
    });

    it('accepts the provider ID explicitly', () => {
      expect(loadConfig({ ...valid, IDENTITY_PROVIDER: 'keycloak' }).identityProvider).toBe(
        'keycloak',
      );
    });

    it('rejects a provider that has no adapter', () => {
      expect(() => loadConfig({ ...valid, IDENTITY_PROVIDER: 'ldap' })).toThrow(
        'IDENTITY_PROVIDER',
      );
    });

    it.each(['not-a-url', 'ftp://idp.test/realms/x'])('rejects the issuer URL %j', (value) => {
      expect(() => loadConfig({ ...valid, IDENTITY_ISSUER_URL: value })).toThrow(
        'IDENTITY_ISSUER_URL',
      );
    });

    it('requires an issuer URL and a client ID', () => {
      expect(() => loadConfig({ DATABASE_URL: valid.DATABASE_URL })).toThrow(
        /IDENTITY_ISSUER_URL, IDENTITY_CLIENT_ID/,
      );
    });

    it('reads a separate audience', () => {
      expect(loadConfig({ ...valid, IDENTITY_AUDIENCE: 'api' }).audience).toBe('api');
    });
  });

  describe('access policy', () => {
    it('defaults the admin roles and the role claim path', () => {
      const config = loadConfig(valid);
      expect(config.adminRoles).toEqual(['super-admin', 'hr-admin']);
      expect(config.rolesClaimPath).toBe('realm_access.roles');
      expect(config.superAdminRole).toBe('super-admin');
    });

    it('reads a custom super-admin role and rejects a blank one', () => {
      expect(loadConfig({ ...valid, AUTH_SUPER_ADMIN_ROLE: ' it-owner ' }).superAdminRole).toBe(
        'it-owner',
      );
      expect(() => loadConfig({ ...valid, AUTH_SUPER_ADMIN_ROLE: '  ' })).toThrow(
        'AUTH_SUPER_ADMIN_ROLE',
      );
    });

    it('reads custom values', () => {
      const config = loadConfig({
        ...valid,
        AUTH_ADMIN_ROLES: ' it-admin , people-ops ',
        AUTH_ROLES_CLAIM_PATH: 'resource_access.accessdesk.roles',
      });
      expect(config.adminRoles).toEqual(['it-admin', 'people-ops']);
      expect(config.rolesClaimPath).toBe('resource_access.accessdesk.roles');
    });

    it.each(['', 'hr-admin,'])('rejects an admin role list with a blank entry (%j)', (value) => {
      expect(() => loadConfig({ ...valid, AUTH_ADMIN_ROLES: value })).toThrow('AUTH_ADMIN_ROLES');
    });

    it.each(['', 'realm_access..roles'])(
      'rejects a claim path with an empty segment (%j)',
      (value) => {
        expect(() => loadConfig({ ...valid, AUTH_ROLES_CLAIM_PATH: value })).toThrow(
          'AUTH_ROLES_CLAIM_PATH',
        );
      },
    );
  });

  it('reads the optional settings', () => {
    const config = loadConfig({
      ...valid,
      API_TRUST_PROXY: 'true',
      RATE_LIMIT_PER_MINUTE: '50',
    });
    expect(config.trustProxy).toBe(true);
    expect(config.rateLimitPerMinute).toBe(50);
  });

  it('rejects values that are not exactly "true" or "false" for flags', () => {
    expect(() => loadConfig({ ...valid, API_TRUST_PROXY: 'yes' })).toThrow('API_TRUST_PROXY');
  });

  it('names the invalid variables', () => {
    expect(() => loadConfig({ ...valid, IDENTITY_ISSUER_URL: 'not-a-url' })).toThrow(
      'IDENTITY_ISSUER_URL',
    );
  });

  it('never echoes values, which may be secrets', () => {
    expect(() => loadConfig({ ...valid, DATABASE_URL: '', IDENTITY_CLIENT_ID: '' })).toThrow(
      /DATABASE_URL, IDENTITY_CLIENT_ID|IDENTITY_CLIENT_ID, DATABASE_URL/,
    );
    let message = '';
    try {
      loadConfig({ ...valid, IDENTITY_ISSUER_URL: 'secret-pass' });
    } catch (error) {
      message = String(error);
    }
    expect(message).not.toContain('secret-pass');
  });
});
