import type { IdentityProvider } from '@accessdesk/identity';
import { createKeycloakIdentityProvider } from '@accessdesk/identity-keycloak';
import type { Config } from '../config';

export type IdentityProviderFactory = (adminAccessToken: string) => IdentityProvider;

export function createIdentityProviderFactory(
  config: Pick<Config, 'identityProvider' | 'issuer'>,
  fetchImpl?: typeof globalThis.fetch,
): IdentityProviderFactory {
  switch (config.identityProvider) {
    case 'keycloak': {
      const build: IdentityProviderFactory = (adminAccessToken) =>
        createKeycloakIdentityProvider({
          issuerUrl: config.issuer,
          getToken: () => adminAccessToken,
          fetch: fetchImpl,
        });
      try {
        build('');
      } catch (error) {
        const reason = error instanceof Error ? error.message : 'unknown reason';
        throw new Error(
          `IDENTITY_ISSUER_URL cannot be used with the "${config.identityProvider}" identity provider: ${reason}`,
          { cause: error },
        );
      }
      return build;
    }
  }
}
