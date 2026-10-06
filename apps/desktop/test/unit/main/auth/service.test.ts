import type { AppSettings } from '@accessdesk/shared';
import { describe, expect, it, vi } from 'vitest';
import { MemoryTokenStorage } from '../helpers/memory-token-storage';
import { discover, OidcError } from '../../../../src/main/auth/oidc';
import { createCodeChallenge } from '../../../../src/main/auth/pkce';
import { AuthService } from '../../../../src/main/auth/service';

const settings: AppSettings = {
  keycloakUrl: 'http://kc.test',
  realm: 'company-platform',
  clientId: 'accessdesk',
  apiUrl: 'http://localhost:4000',
};
const ISSUER = 'http://kc.test/realms/company-platform';

const jwt = (claims: object) => `h.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.s`;

interface FakeKeycloakOptions {
  issuer?: string;
  tokenResponses?: Response[];
}

function fakeKeycloak(options: FakeKeycloakOptions = {}) {
  const tokenCalls: URLSearchParams[] = [];
  const logoutCalls: URLSearchParams[] = [];
  const queue = [...(options.tokenResponses ?? [])];

  const fetchFn = vi.fn<typeof fetch>(async (input, init) => {
    const url = String(input);
    if (url.endsWith('/.well-known/openid-configuration')) {
      return Response.json({
        issuer: options.issuer ?? ISSUER,
        authorization_endpoint: `${ISSUER}/protocol/openid-connect/auth`,
        token_endpoint: `${ISSUER}/protocol/openid-connect/token`,
        end_session_endpoint: `${ISSUER}/protocol/openid-connect/logout`,
      });
    }
    if (url.endsWith('/token')) {
      tokenCalls.push(new URLSearchParams(init?.body as URLSearchParams));
      return queue.shift() ?? Response.json({ error: 'invalid_grant' }, { status: 400 });
    }
    if (url.endsWith('/logout')) {
      logoutCalls.push(new URLSearchParams(init?.body as URLSearchParams));
      return new Response(null, { status: 204 });
    }
    return new Response('unexpected', { status: 500 });
  });
  return { fetchFn, tokenCalls, logoutCalls };
}

function tokenResponse(accessToken: string, refreshToken = 'refresh-1', expiresIn = 300) {
  return Response.json({
    access_token: accessToken,
    refresh_token: refreshToken,
    expires_in: expiresIn,
  });
}

function makeService(
  fetchFn: typeof fetch,
  openExternal: (url: string) => Promise<void>,
  now: () => number = Date.now,
) {
  return new AuthService({
    getSettings: async () => settings,
    tokenStore: new MemoryTokenStorage(),
    openExternal,
    fetch: fetchFn,
    now,
  });
}

describe('login (authorization code + PKCE, system browser, loopback redirect)', () => {
  it('completes the flow without ever sending a client secret', async () => {
    const access = jwt({
      preferred_username: 'hana',
      name: 'Hana HR',
      realm_access: { roles: ['hr-admin'] },
    });
    const kc = fakeKeycloak({ tokenResponses: [tokenResponse(access)] });
    let authUrl!: URL;

    // Plays the part of the user's browser: follow the redirect back to the loopback listener.
    const service = makeService(kc.fetchFn, async (url) => {
      authUrl = new URL(url);
      const redirect = new URL(authUrl.searchParams.get('redirect_uri')!);
      void fetch(`${redirect}?code=the-code&state=${authUrl.searchParams.get('state')}`);
    });

    const status = await service.login();

    expect(status).toMatchObject({
      authenticated: true,
      username: 'hana',
      displayName: 'Hana HR',
      roles: ['hr-admin'],
    });

    expect(authUrl.origin + authUrl.pathname).toBe(`${ISSUER}/protocol/openid-connect/auth`);
    expect(authUrl.searchParams.get('response_type')).toBe('code');
    expect(authUrl.searchParams.get('client_id')).toBe('accessdesk');
    expect(authUrl.searchParams.get('code_challenge_method')).toBe('S256');
    expect(authUrl.searchParams.get('redirect_uri')).toMatch(
      /^http:\/\/127\.0\.0\.1:\d+\/callback$/,
    );

    const form = kc.tokenCalls[0]!;
    expect(form.get('grant_type')).toBe('authorization_code');
    expect(form.get('code')).toBe('the-code');
    expect(form.get('redirect_uri')).toBe(authUrl.searchParams.get('redirect_uri'));
    // The verifier sent now must hash to the challenge sent in the browser URL.
    expect(createCodeChallenge(form.get('code_verifier')!)).toBe(
      authUrl.searchParams.get('code_challenge'),
    );
    expect(form.has('client_secret')).toBe(false);
  });

  it('can be cancelled while waiting for the browser', async () => {
    const kc = fakeKeycloak();
    const opened = vi.fn(async () => {});
    const service = makeService(kc.fetchFn, opened);
    const login = service.login();
    // Once the browser has been opened, the loopback listener is up and waiting.
    await vi.waitFor(() => expect(opened).toHaveBeenCalled());
    service.cancelLogin();
    await expect(login).rejects.toThrow('cancelled');
  });

  it('refuses to start without settings', async () => {
    const service = new AuthService({
      getSettings: async () => null,
      tokenStore: new MemoryTokenStorage(),
      openExternal: async () => {},
    });
    await expect(service.login()).rejects.toThrow('Set up');
  });
});

describe('token lifetime', () => {
  async function signedInService(kc: ReturnType<typeof fakeKeycloak>, clock: { now: number }) {
    const service = makeService(
      kc.fetchFn,
      async (url) => {
        const u = new URL(url);
        void fetch(
          `${u.searchParams.get('redirect_uri')}?code=c&state=${u.searchParams.get('state')}`,
        );
      },
      () => clock.now,
    );
    await service.login();
    return service;
  }

  it('returns the stored token while it is fresh', async () => {
    const clock = { now: 1_000_000 };
    const kc = fakeKeycloak({ tokenResponses: [tokenResponse('access-1')] });
    const service = await signedInService(kc, clock);
    expect(await service.getAccessToken()).toBe('access-1');
    expect(kc.tokenCalls).toHaveLength(1);
  });

  it('refreshes an expiring token once, even for parallel requests', async () => {
    const clock = { now: 1_000_000 };
    const kc = fakeKeycloak({
      tokenResponses: [tokenResponse('access-1'), tokenResponse('access-2', 'refresh-2')],
    });
    const service = await signedInService(kc, clock);

    clock.now += 290_000; // inside the 30 s safety margin of a 300 s token
    const results = await Promise.all([service.getAccessToken(), service.getAccessToken()]);

    expect(results).toEqual(['access-2', 'access-2']);
    const refreshes = kc.tokenCalls.filter((c) => c.get('grant_type') === 'refresh_token');
    expect(refreshes).toHaveLength(1);
    expect(refreshes[0]!.get('refresh_token')).toBe('refresh-1');
    expect(refreshes[0]!.has('client_secret')).toBe(false);
  });

  it('signs the user out when the refresh token is no longer valid', async () => {
    const clock = { now: 1_000_000 };
    const kc = fakeKeycloak({
      tokenResponses: [
        tokenResponse('access-1'),
        Response.json(
          { error: 'invalid_grant', error_description: 'Session not active' },
          { status: 400 },
        ),
      ],
    });
    const service = await signedInService(kc, clock);

    clock.now += 400_000;
    expect(await service.getAccessToken()).toBeNull();
    expect((await service.status()).authenticated).toBe(false);
  });

  it('keeps the session when Keycloak is only temporarily unreachable', async () => {
    const clock = { now: 1_000_000 };
    const kc = fakeKeycloak({ tokenResponses: [tokenResponse('access-1')] });
    const service = await signedInService(kc, clock);

    clock.now += 400_000;
    kc.fetchFn.mockRejectedValue(new TypeError('network down'));
    await expect(service.getAccessToken()).rejects.toBeInstanceOf(OidcError);
    expect((await service.status()).authenticated).toBe(true);
  });
});

describe('logout', () => {
  it('clears the local session and ends the Keycloak session', async () => {
    const kc = fakeKeycloak({ tokenResponses: [tokenResponse('access-1', 'refresh-1')] });
    const service = makeService(kc.fetchFn, async (url) => {
      const u = new URL(url);
      void fetch(
        `${u.searchParams.get('redirect_uri')}?code=c&state=${u.searchParams.get('state')}`,
      );
    });
    await service.login();

    const status = await service.logout();

    expect(status.authenticated).toBe(false);
    expect(await service.getAccessToken()).toBeNull();
    expect(kc.logoutCalls[0]!.get('refresh_token')).toBe('refresh-1');
    expect(kc.logoutCalls[0]!.get('client_id')).toBe('accessdesk');
  });
});

describe('discovery', () => {
  it('rejects a realm whose issuer does not match the configured URL', async () => {
    const kc = fakeKeycloak({ issuer: 'http://other.test/realms/company-platform' });
    await expect(discover(settings, kc.fetchFn)).rejects.toThrow('issuer');
  });

  it('reports an unreachable server in plain words', async () => {
    const down = vi.fn<typeof fetch>().mockRejectedValue(new TypeError('fetch failed'));
    await expect(discover(settings, down)).rejects.toThrow('Could not reach Keycloak');
  });

  it('reports an unknown realm', async () => {
    const notFound = vi.fn<typeof fetch>().mockResolvedValue(new Response('', { status: 404 }));
    await expect(discover(settings, notFound)).rejects.toThrow('not found');
  });
});
