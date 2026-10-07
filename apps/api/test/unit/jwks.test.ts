import { SignJWT, exportJWK, generateKeyPair, jwtVerify, type CryptoKey } from 'jose';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { createDiscoveredKeyResolver } from '../../src/plugins/jwks';

const ISSUER = 'http://idp.test/realms/company-platform';
const DISCOVERY_URL = `${ISSUER}/.well-known/openid-configuration`;
const JWKS_URL = 'http://idp.test/keys';

let privateKey: CryptoKey;
let jwks: { keys: unknown[] };

beforeAll(async () => {
  const pair = await generateKeyPair('RS256');
  privateKey = pair.privateKey;
  jwks = { keys: [{ ...(await exportJWK(pair.publicKey)), kid: 'k1', alg: 'RS256', use: 'sig' }] };
});

const sign = () =>
  new SignJWT({})
    .setProtectedHeader({ alg: 'RS256', kid: 'k1' })
    .setIssuer(ISSUER)
    .setExpirationTime('5m')
    .sign(privateKey);

const discoveryDoc = (overrides: Record<string, unknown> = {}) => ({
  issuer: ISSUER,
  jwks_uri: JWKS_URL,
  ...overrides,
});

function fakeFetch(handlers: Record<string, () => Response>) {
  return vi.fn<typeof fetch>(async (input) => {
    const handler = handlers[String(input)];
    return handler ? handler() : new Response('not found', { status: 404 });
  });
}

describe('OIDC discovery of signing keys', () => {
  it('follows the discovery document to its jwks_uri and verifies a token with those keys', async () => {
    const fetchMock = fakeFetch({
      [DISCOVERY_URL]: () => Response.json(discoveryDoc()),
      [JWKS_URL]: () => Response.json(jwks),
    });
    const keys = createDiscoveredKeyResolver(ISSUER, fetchMock);

    const { payload } = await jwtVerify(await sign(), keys, { issuer: ISSUER });

    expect(payload.iss).toBe(ISSUER);
    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([DISCOVERY_URL, JWKS_URL]);
  });

  it('does not use the network until the first token arrives', () => {
    const fetchMock = fakeFetch({});
    createDiscoveredKeyResolver(ISSUER, fetchMock);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('discovers once and reuses the result for later tokens', async () => {
    const fetchMock = fakeFetch({
      [DISCOVERY_URL]: () => Response.json(discoveryDoc()),
      [JWKS_URL]: () => Response.json(jwks),
    });
    const keys = createDiscoveredKeyResolver(ISSUER, fetchMock);

    await jwtVerify(await sign(), keys, { issuer: ISSUER });
    await jwtVerify(await sign(), keys, { issuer: ISSUER });

    const discoveryCalls = fetchMock.mock.calls.filter(([url]) => String(url) === DISCOVERY_URL);
    expect(discoveryCalls).toHaveLength(1);
  });

  it('tries again after a failed discovery instead of remembering the failure', async () => {
    let healthy = false;
    const fetchMock = fakeFetch({
      [DISCOVERY_URL]: () =>
        healthy ? Response.json(discoveryDoc()) : new Response('down', { status: 503 }),
      [JWKS_URL]: () => Response.json(jwks),
    });
    const keys = createDiscoveredKeyResolver(ISSUER, fetchMock);
    const token = await sign();

    await expect(jwtVerify(token, keys, { issuer: ISSUER })).rejects.toThrow('HTTP 503');
    healthy = true;
    await expect(jwtVerify(token, keys, { issuer: ISSUER })).resolves.toBeDefined();
  });

  it('rejects a discovery document that names another issuer', async () => {
    const fetchMock = fakeFetch({
      [DISCOVERY_URL]: () => Response.json(discoveryDoc({ issuer: 'http://evil.test/realms/x' })),
    });
    const keys = createDiscoveredKeyResolver(ISSUER, fetchMock);

    await expect(jwtVerify(await sign(), keys, { issuer: ISSUER })).rejects.toThrow(
      'another issuer',
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['has no jwks_uri', { jwks_uri: undefined }],
    ['has a jwks_uri that is not a web URL', { jwks_uri: 'file:///etc/passwd' }],
  ])('rejects a discovery document that %s', async (_name, overrides) => {
    const fetchMock = fakeFetch({
      [DISCOVERY_URL]: () => Response.json(discoveryDoc(overrides)),
    });
    const keys = createDiscoveredKeyResolver(ISSUER, fetchMock);

    await expect(jwtVerify(await sign(), keys, { issuer: ISSUER })).rejects.toThrow();
  });
});
