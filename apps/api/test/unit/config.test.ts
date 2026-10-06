import { describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/config';

const valid = {
  KEYCLOAK_URL: 'http://localhost:8080/',
  KEYCLOAK_REALM: 'company-platform',
  KEYCLOAK_CLIENT_ID: 'accessdesk',
  DATABASE_URL: 'postgresql://user:secret-pass@localhost:5432/accessdesk',
};

describe('loadConfig', () => {
  it('derives the issuer and defaults the audience to the client ID', () => {
    const config = loadConfig(valid);
    expect(config.keycloakUrl).toBe('http://localhost:8080');
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

  it('reads the optional settings', () => {
    const config = loadConfig({
      ...valid,
      KEYCLOAK_AUDIENCE: 'api',
      API_TRUST_PROXY: 'true',
      RATE_LIMIT_PER_MINUTE: '50',
    });
    expect(config.audience).toBe('api');
    expect(config.trustProxy).toBe(true);
    expect(config.rateLimitPerMinute).toBe(50);
  });

  it('rejects values that are not exactly "true" or "false" for flags', () => {
    expect(() => loadConfig({ ...valid, API_TRUST_PROXY: 'yes' })).toThrow('API_TRUST_PROXY');
  });

  it('names the invalid variables', () => {
    expect(() => loadConfig({ ...valid, KEYCLOAK_URL: 'not-a-url' })).toThrow('KEYCLOAK_URL');
  });

  it('never echoes values, which may be secrets', () => {
    expect(() => loadConfig({ ...valid, DATABASE_URL: '', KEYCLOAK_REALM: '' })).toThrow(
      /DATABASE_URL, KEYCLOAK_REALM|KEYCLOAK_REALM, DATABASE_URL/,
    );
    let message = '';
    try {
      loadConfig({ ...valid, KEYCLOAK_URL: 'secret-pass' });
    } catch (error) {
      message = String(error);
    }
    expect(message).not.toContain('secret-pass');
  });
});
