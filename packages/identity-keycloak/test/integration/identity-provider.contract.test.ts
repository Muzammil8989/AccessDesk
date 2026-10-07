import { runIdentityProviderContract } from '@accessdesk/identity/testing';
import { createKeycloakIdentityProvider } from '../../src/index';
import { FAKE_ISSUER_URL, createFakeAdminServer } from '../helpers/fake-admin-server';

runIdentityProviderContract('adapter for the first supported provider', () => {
  const server = createFakeAdminServer();
  return {
    provider: createKeycloakIdentityProvider({
      issuerUrl: FAKE_ISSUER_URL,
      getToken: () => 'admin-token',
      fetch: server.fetch,
    }),
    seedGroup: async (name) => server.seedGroup(name),
    seedRole: async (name) => server.seedRole(name),
  };
});
