import { readRolesFromClaims } from '@accessdesk/identity';
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
  expiresAt: number;
}

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
  settings: Pick<AppSettings, 'issuerUrl'>,
  fetchFn: FetchFn = fetch,
): Promise<OidcEndpoints> {
  const issuer = settings.issuerUrl;
  let response: Response;
  try {
    response = await fetchFn(`${issuer}/.well-known/openid-configuration`, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new OidcError(`Could not reach the identity provider at ${issuer}`);
  }
  if (!response.ok) {
    throw new OidcError(
      `No OpenID configuration was found at ${issuer} (HTTP ${response.status}). Check the issuer URL.`,
    );
  }
  const doc = discoverySchema.parse(await response.json());
  if (doc.issuer !== issuer) {
    throw new OidcError(
      `The identity provider reports issuer "${doc.issuer}" but the settings point to "${issuer}". Use the exact issuer URL it is configured with.`,
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
    throw new OidcError('Could not reach the identity provider');
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
    throw new OidcError(`The identity provider rejected the request: ${description}`, code);
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
  } catch {}
}

const displayClaimsSchema = z.object({
  preferred_username: z.string().optional(),
  name: z.string().optional(),
});

export interface DisplayClaims {
  username?: string;
  name?: string;
  roles: string[];
}

export function readDisplayClaims(accessToken: string, rolesClaimPath: string): DisplayClaims {
  try {
    const payload = accessToken.split('.')[1];
    if (!payload) return { roles: [] };
    const claims: unknown = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (typeof claims !== 'object' || claims === null) return { roles: [] };
    const display = displayClaimsSchema.parse(claims);
    let roles: string[] = [];
    try {
      roles = readRolesFromClaims(claims, rolesClaimPath);
    } catch {}
    return { username: display.preferred_username, name: display.name, roles };
  } catch {
    return { roles: [] };
  }
}
