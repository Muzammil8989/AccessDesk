import type { AppSettings } from '@accessdesk/shared';
import { z } from 'zod';

type FetchFn = typeof globalThis.fetch;

export interface OidcEndpoints {
  issuer: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  logoutEndpoint: string | null;
}

export interface TokenSet {
  accessToken: string;
  refreshToken: string | null;
  /** Epoch milliseconds. */
  expiresAt: number;
}

/** Thrown when Keycloak rejects a grant, for example an expired or revoked refresh token. */
export class OidcError extends Error {
  constructor(
    message: string,
    readonly code: string | null = null,
  ) {
    super(message);
    this.name = 'OidcError';
  }
}

const REQUEST_TIMEOUT_MS = 15_000;

const discoverySchema = z.object({
  issuer: z.string(),
  authorization_endpoint: z.url(),
  token_endpoint: z.url(),
  end_session_endpoint: z.url().optional(),
});

const tokenResponseSchema = z.object({
  access_token: z.string(),
  refresh_token: z.string().optional(),
  expires_in: z.number(),
});

export async function discover(
  settings: Pick<AppSettings, 'keycloakUrl' | 'realm'>,
  fetchFn: FetchFn = fetch,
): Promise<OidcEndpoints> {
  const issuer = `${settings.keycloakUrl}/realms/${encodeURIComponent(settings.realm)}`;
  let response: Response;
  try {
    response = await fetchFn(`${issuer}/.well-known/openid-configuration`, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new OidcError(`Could not reach Keycloak at ${settings.keycloakUrl}`);
  }
  if (!response.ok) {
    throw new OidcError(
      `Keycloak realm "${settings.realm}" was not found (HTTP ${response.status}). Check the URL and realm.`,
    );
  }
  const doc = discoverySchema.parse(await response.json());
  // The API checks tokens against this same issuer, so a mismatch would fail later anyway.
  if (doc.issuer !== issuer) {
    throw new OidcError(
      `Keycloak reports issuer "${doc.issuer}" but the settings point to "${issuer}". Use the URL Keycloak is configured with.`,
    );
  }
  return {
    issuer: doc.issuer,
    authorizationEndpoint: doc.authorization_endpoint,
    tokenEndpoint: doc.token_endpoint,
    logoutEndpoint: doc.end_session_endpoint ?? null,
  };
}

export function buildAuthorizationUrl(args: {
  endpoints: OidcEndpoints;
  clientId: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
}): string {
  const url = new URL(args.endpoints.authorizationEndpoint);
  url.search = new URLSearchParams({
    response_type: 'code',
    client_id: args.clientId,
    redirect_uri: args.redirectUri,
    scope: 'openid profile email',
    state: args.state,
    code_challenge: args.codeChallenge,
    code_challenge_method: 'S256',
  }).toString();
  return url.toString();
}

// Public client: no client_secret is ever sent. PKCE proves the caller started the flow.
async function postToken(
  endpoint: string,
  form: Record<string, string>,
  fetchFn: FetchFn,
  now: number,
): Promise<TokenSet> {
  let response: Response;
  try {
    response = await fetchFn(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: new URLSearchParams(form),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new OidcError('Could not reach Keycloak');
  }

  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error = z
      .object({ error: z.string(), error_description: z.string().optional() })
      .safeParse(body);
    const code = error.success ? error.data.error : null;
    const description = error.success
      ? (error.data.error_description ?? error.data.error)
      : response.statusText;
    throw new OidcError(`Keycloak rejected the request: ${description}`, code);
  }

  const tokens = tokenResponseSchema.parse(body);
  return {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token ?? null,
    expiresAt: now + tokens.expires_in * 1000,
  };
}

export function exchangeCode(args: {
  endpoints: OidcEndpoints;
  clientId: string;
  code: string;
  redirectUri: string;
  codeVerifier: string;
  fetchFn?: FetchFn;
  now?: number;
}): Promise<TokenSet> {
  return postToken(
    args.endpoints.tokenEndpoint,
    {
      grant_type: 'authorization_code',
      client_id: args.clientId,
      code: args.code,
      redirect_uri: args.redirectUri,
      code_verifier: args.codeVerifier,
    },
    args.fetchFn ?? fetch,
    args.now ?? Date.now(),
  );
}

export function refreshTokens(args: {
  endpoints: OidcEndpoints;
  clientId: string;
  refreshToken: string;
  fetchFn?: FetchFn;
  now?: number;
}): Promise<TokenSet> {
  return postToken(
    args.endpoints.tokenEndpoint,
    {
      grant_type: 'refresh_token',
      client_id: args.clientId,
      refresh_token: args.refreshToken,
    },
    args.fetchFn ?? fetch,
    args.now ?? Date.now(),
  );
}

/** Ends the Keycloak SSO session from the back channel. Best effort: local sign-out never depends on it. */
export async function endSession(args: {
  endpoints: OidcEndpoints;
  clientId: string;
  refreshToken: string;
  fetchFn?: FetchFn;
}): Promise<void> {
  if (!args.endpoints.logoutEndpoint) return;
  try {
    await (args.fetchFn ?? fetch)(args.endpoints.logoutEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: args.clientId, refresh_token: args.refreshToken }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    // Ignore: the tokens are discarded locally either way.
  }
}

const claimsSchema = z.object({
  preferred_username: z.string().optional(),
  name: z.string().optional(),
  realm_access: z.object({ roles: z.array(z.string()) }).optional(),
});

/**
 * Reads claims for display only. The signature is NOT checked here: the API verifies
 * every token, and nothing in the desktop app makes a security decision from these values.
 */
export function readDisplayClaims(accessToken: string): z.infer<typeof claimsSchema> {
  try {
    const payload = accessToken.split('.')[1];
    if (!payload) return {};
    return claimsSchema.parse(JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')));
  } catch {
    return {};
  }
}
