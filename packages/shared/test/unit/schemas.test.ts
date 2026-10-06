import { describe, expect, it } from 'vitest';
import { appSettingsSchema, listEmployeesQuerySchema } from '../../src/index';

describe('listEmployeesQuerySchema', () => {
  it('applies defaults and coerces numbers from query strings', () => {
    expect(listEmployeesQuerySchema.parse({})).toEqual({ first: 0, max: 20 });
    expect(listEmployeesQuerySchema.parse({ first: '40', max: '10', search: ' ann ' })).toEqual({
      first: 40,
      max: 10,
      search: 'ann',
    });
  });

  it('rejects page sizes above the limit', () => {
    expect(listEmployeesQuerySchema.safeParse({ max: '1000' }).success).toBe(false);
  });
});

describe('appSettingsSchema', () => {
  it('trims trailing slashes from URLs', () => {
    const parsed = appSettingsSchema.parse({
      keycloakUrl: 'http://localhost:8080/',
      realm: 'company-platform',
      clientId: 'accessdesk',
      apiUrl: 'http://localhost:4000//',
    });
    expect(parsed.keycloakUrl).toBe('http://localhost:8080');
    expect(parsed.apiUrl).toBe('http://localhost:4000');
  });

  it('rejects a realm that could alter a URL path', () => {
    const result = appSettingsSchema.safeParse({
      keycloakUrl: 'http://localhost:8080',
      realm: '../master',
      clientId: 'accessdesk',
      apiUrl: 'http://localhost:4000',
    });
    expect(result.success).toBe(false);
  });
});
