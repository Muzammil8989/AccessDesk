import type { AccessPolicy } from '@accessdesk/identity';
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
  policy: AccessPolicy;
  tokenStore: TokenStorage;
  openExternal(url: string): Promise<void>;
  fetch?: typeof globalThis.fetch;
  now?: () => number;
}

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
    const adminRoles = this.deps.policy.adminRoles;
    const tokens = await this.deps.tokenStore.load();
    const usable = tokens && (tokens.refreshToken !== null || tokens.expiresAt > this.now());
    if (!tokens || !usable) {
      return {
        authenticated: false,
        username: null,
        displayName: null,
        roles: [],
        adminRoles,
        persistent,
      };
    }
    const claims = readDisplayClaims(tokens.accessToken, this.deps.policy.rolesClaimPath);
    return {
      authenticated: true,
      username: claims.username ?? null,
      displayName: claims.name ?? null,
      roles: claims.roles,
      adminRoles,
      persistent,
    };
  }

  async login(): Promise<AuthStatus> {
    const settings = await this.deps.getSettings();
    if (!settings) throw new Error('Set up the identity provider connection first');

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
      loopback.cancel();
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
      } catch {}
    }
    return this.status();
  }

  async clearSession(): Promise<void> {
    this.cancelLogin();
    await this.deps.tokenStore.clear();
  }

  async getAccessToken(): Promise<string | null> {
    const tokens = await this.deps.tokenStore.load();
    if (!tokens) return null;
    if (tokens.expiresAt - this.now() > EXPIRY_MARGIN_MS) return tokens.accessToken;
    return (await this.refresh())?.accessToken ?? null;
  }

  async forceRefresh(): Promise<string | null> {
    return (await this.refresh())?.accessToken ?? null;
  }

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
      const merged = { ...next, refreshToken: next.refreshToken ?? tokens.refreshToken };
      await this.deps.tokenStore.save(merged);
      return merged;
    } catch (error) {
      if (error instanceof OidcError && error.code) {
        await this.deps.tokenStore.clear();
        return null;
      }
      throw error;
    }
  }
}
