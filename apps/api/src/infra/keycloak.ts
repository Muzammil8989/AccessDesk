import { createKeycloakClient, type KeycloakClient } from '@accessdesk/keycloak-client';
import type { Config } from '../config';

/**
 * Builds a Keycloak client that acts as one specific admin: it sends that admin's own access
 * token, never a service account, so Keycloak's admin events name the real person.
 * Modules depend on this type, not on how the client is built, which keeps them easy to test.
 */
export type KeycloakClientFactory = (adminAccessToken: string) => KeycloakClient;

export function createKeycloakClientFactory(
  config: Pick<Config, 'keycloakUrl' | 'realm'>,
  fetchImpl?: typeof globalThis.fetch,
): KeycloakClientFactory {
  return (adminAccessToken) =>
    createKeycloakClient({
      baseUrl: config.keycloakUrl,
      realm: config.realm,
      getToken: () => adminAccessToken,
      fetch: fetchImpl,
    });
}
