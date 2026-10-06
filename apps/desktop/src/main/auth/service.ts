import type { AppSettings } from '@accessdesk/shared';
import type { AuthStatus } from '../../shared/ipc';
import type { TokenStorage } from '../store/tokenStore';
import { startLoopback, type LoopbackSession } from './loopback';
import {
  OidcError,
  buildAuthorizationUrl,
  discover,
  endSession,
  exchangeCode,
  readDisplayClaims,
  refreshTokens,
  type OidcEndpoints,
  type TokenSet,
} from './oidc';
import { createCodeChallenge, createCodeVerifier, createState } from './pkce';

export interface AuthServiceDeps {
  getSettings(): Promise<AppSettings | null>;
  tokenStore: TokenStorage;
  /** Opens the system browser. Never an embedded window. */
  openExternal(url: string): Promise<void>;
  fetch?: typeof globalThis.fetch;
  now?: () => number;
}

// Refresh a little early so a token does not expire while a request is in flight.
const EXPIRY_MARGIN_MS = 30_000;

export class AuthService {
  private pendingLogin: LoopbackSession | null = null;
  private refreshInFlight: Promise<TokenSet | null> | null = null;

  constructor(private readonly deps: AuthServiceDeps) {}

  private now(): number {
    return (this.deps.now ?? Date.now)();
  }

  async status(): Promise<AuthStatus> {
    const persistent = this.deps.tokenStore.persistent;
    const tokens = await this.deps.tokenStore.load();
    // An expired access token is still a live session if it can be refreshed.
    const usable = tokens && (tokens.refreshToken !== null || tokens.expiresAt > this.now());
    if (!tokens || !usable) {
      return { authenticated: false, username: null, displayName: null, roles: [], persistent };
    }
    const claims = readDisplayClaims(tokens.accessToken);
    return {
      authenticated: true,
      username: claims.preferred_username ?? null,
      displayName: claims.name ?? null,
      roles: claims.realm_access?.roles ?? [],
      persistent,
    };
  }

  async login(): Promise<AuthStatus> {
    const settings = await this.deps.getSettings();
    if (!settings) throw new Error('Set up the Keycloak connection first');

    this.pendingLogin?.cancel();
    const endpoints = await discover(settings, this.deps.fetch);
    const state = createState();
    const codeVerifier = createCodeVerifier();
    const loopback = await startLoopback({ expectedState: state });
    this.pendingLogin = loopback;

    try {
      await this.deps.openExternal(
        buildAuthorizationUrl({
          endpoints,
          clientId: settings.clientId,
          redirectUri: loopback.redirectUri,
          state,
          codeChallenge: createCodeChallenge(codeVerifier),
        }),
      );
      const code = await loopback.result;
      const tokens = await exchangeCode({
        endpoints,
        clientId: settings.clientId,
        code,
        redirectUri: loopback.redirectUri,
        codeVerifier,
        fetchFn: this.deps.fetch,
        now: this.now(),
      });
      await this.deps.tokenStore.save(tokens);
      return await this.status();
    } finally {
      if (this.pendingLogin === loopback) this.pendingLogin = null;
      loopback.cancel(); // No-op when the login already finished; frees the port otherwise.
    }
  }

  cancelLogin(): void {
    this.pendingLogin?.cancel();
  }

  async logout(): Promise<AuthStatus> {
    const tokens = await this.deps.tokenStore.load();
    const settings = await this.deps.getSettings();
    await this.deps.tokenStore.clear();

    if (tokens?.refreshToken && settings) {
      try {
        const endpoints = await discover(settings, this.deps.fetch);
        await endSession({
          endpoints,
          clientId: settings.clientId,
          refreshToken: tokens.refreshToken,
          fetchFn: this.deps.fetch,
        });
      } catch {
        // Keycloak unreachable: the local session is already gone.
      }
    }
    return this.status();
  }

  /** Drops the local session without contacting Keycloak (used when settings change). */
  async clearSession(): Promise<void> {
    this.cancelLogin();
    await this.deps.tokenStore.clear();
  }

  /** A valid access token, refreshed when needed, or null when the user must sign in again. */
  async getAccessToken(): Promise<string | null> {
    const tokens = await this.deps.tokenStore.load();
    if (!tokens) return null;
    if (tokens.expiresAt - this.now() > EXPIRY_MARGIN_MS) return tokens.accessToken;
    return (await this.refresh())?.accessToken ?? null;
  }

  /** Used after the API answers 401 although the token looked valid locally. */
  async forceRefresh(): Promise<string | null> {
    return (await this.refresh())?.accessToken ?? null;
  }

  // Several requests can find an expired token at once. Share one refresh: refresh
  // tokens may be single-use, so parallel refreshes would invalidate each other.
  private refresh(): Promise<TokenSet | null> {
    this.refreshInFlight ??= this.doRefresh().finally(() => {
      this.refreshInFlight = null;
    });
    return this.refreshInFlight;
  }

  private async doRefresh(): Promise<TokenSet | null> {
    const tokens = await this.deps.tokenStore.load();
    const settings = await this.deps.getSettings();
    if (!tokens?.refreshToken || !settings) {
      await this.deps.tokenStore.clear();
      return null;
    }
    try {
      const endpoints: OidcEndpoints = await discover(settings, this.deps.fetch);
      const next = await refreshTokens({
        endpoints,
        clientId: settings.clientId,
        refreshToken: tokens.refreshToken,
        fetchFn: this.deps.fetch,
        now: this.now(),
      });
      // Keycloak may omit a new refresh token. Keep the old one then.
      const merged = { ...next, refreshToken: next.refreshToken ?? tokens.refreshToken };
      await this.deps.tokenStore.save(merged);
      return merged;
    } catch (error) {
      // An OAuth error (e.g. invalid_grant) means the session ended: sign the user out.
      // A network error leaves the tokens in place so the next attempt can succeed.
      if (error instanceof OidcError && error.code) {
        await this.deps.tokenStore.clear();
        return null;
      }
      throw error;
    }
  }
}
