import { describe, expect, it, vi } from 'vitest';
import { createIdentityProviderFactory } from '../../src/infra/identity';

describe('createIdentityProviderFactory', () => {
  const config = {
    identityProvider: 'keycloak',
    issuer: 'http://idp.test/realms/company',
  } as const;

  it('builds a provider that acts as the given admin', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(Response.json(3));
    const identityFor = createIdentityProviderFactory(config, fetchMock);

    expect(await identityFor('admin-token').countUsers()).toBe(3);

    const [, init] = fetchMock.mock.calls[0]!;
    expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer admin-token');
  });

  it('stops at startup, naming the variable, when the issuer URL does not suit the adapter', () => {
    expect(() => createIdentityProviderFactory({ ...config, issuer: 'http://idp.test' })).toThrow(
      /^IDENTITY_ISSUER_URL cannot be used with the "keycloak" identity provider: .*\/realms\/<realm>/,
    );
  });
});
