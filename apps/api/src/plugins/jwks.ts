import { createRemoteJWKSet, customFetch, type JWTVerifyGetKey } from 'jose';
import { z } from 'zod';

const DISCOVERY_TIMEOUT_MS = 10_000;

const discoverySchema = z.object({
  issuer: z.string(),
  jwks_uri: z.url({ protocol: /^https?$/ }),
});

export function createDiscoveredKeyResolver(
  issuer: string,
  fetchImpl: typeof globalThis.fetch = globalThis.fetch,
): JWTVerifyGetKey {
  let keys: Promise<JWTVerifyGetKey> | null = null;

  async function discover(): Promise<JWTVerifyGetKey> {
    const response = await fetchImpl(`${issuer}/.well-known/openid-configuration`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(DISCOVERY_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`OIDC discovery failed (HTTP ${response.status})`);
    const doc = discoverySchema.parse(await response.json());
    if (doc.issuer !== issuer) throw new Error('OIDC discovery document names another issuer');
    return createRemoteJWKSet(new URL(doc.jwks_uri), {
      [customFetch]: (url, init) => fetchImpl(url, init),
    });
  }

  return async (header, token) => {
    keys ??= discover().catch((error: unknown) => {
      keys = null;
      throw error;
    });
    return (await keys)(header, token);
  };
}
