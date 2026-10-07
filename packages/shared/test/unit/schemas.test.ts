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
  const valid = {
    issuerUrl: 'http://localhost:8080/realms/company-platform',
    clientId: 'accessdesk',
    apiUrl: 'http://localhost:4000',
  };

  it('trims trailing slashes from URLs', () => {
    const parsed = appSettingsSchema.parse({
      ...valid,
      issuerUrl: 'http://localhost:8080/realms/company-platform/',
      apiUrl: 'http://localhost:4000//',
    });
    expect(parsed.issuerUrl).toBe('http://localhost:8080/realms/company-platform');
    expect(parsed.apiUrl).toBe('http://localhost:4000');
  });

  it.each([
    'http://localhost:8080/realms/x?next=//evil.test',
    'http://localhost:8080/realms/x#frag',
    'http://user:pass@localhost:8080/realms/x',
    'ftp://localhost:8080/realms/x',
    'not a url',
  ])('rejects an issuer URL that could redirect or leak (%s)', (issuerUrl) => {
    expect(appSettingsSchema.safeParse({ ...valid, issuerUrl }).success).toBe(false);
  });

  it('rejects a client ID that could alter a URL', () => {
    expect(appSettingsSchema.safeParse({ ...valid, clientId: 'a/b?c' }).success).toBe(false);
  });
});
