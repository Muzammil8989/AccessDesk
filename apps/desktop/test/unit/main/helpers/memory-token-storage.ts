import type { TokenSet } from '../../../../src/main/auth/oidc';
import type { TokenStorage } from '../../../../src/main/store/tokenStore';

export class MemoryTokenStorage implements TokenStorage {
  private tokens: TokenSet | null = null;
  readonly persistent = true;

  async load() {
    return this.tokens;
  }
  async save(tokens: TokenSet) {
    this.tokens = tokens;
  }
  async clear() {
    this.tokens = null;
  }
}
