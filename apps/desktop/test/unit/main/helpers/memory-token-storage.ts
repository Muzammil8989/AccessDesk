import type { TokenSet } from '../../../../src/main/auth/oidc';
import type { TokenStorage } from '../../../../src/main/store/tokenStore';

/** A storage that keeps tokens in a variable. Lets the auth service be tested with no files or crypto. */
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
