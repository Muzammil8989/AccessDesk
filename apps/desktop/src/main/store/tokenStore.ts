import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import type { TokenSet } from '../auth/oidc';

/** Thin wrapper over Electron's safeStorage, injected so this module runs (and tests) without Electron. */
export interface SecretCipher {
  isAvailable(): boolean;
  encrypt(plain: string): Buffer;
  decrypt(data: Buffer): string;
}

const tokenSetSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string().nullable(),
  expiresAt: z.number(),
});

/** What the auth service needs from token storage. It depends on this, not on the file-based class. */
export interface TokenStorage {
  /** True when tokens survive an app restart (secure storage is available). */
  readonly persistent: boolean;
  load(): Promise<TokenSet | null>;
  save(tokens: TokenSet): Promise<void>;
  clear(): Promise<void>;
}

/**
 * Keeps tokens in memory and, when the OS secure storage is available (DPAPI, Keychain,
 * libsecret), as an encrypted blob on disk so the session survives a restart.
 * Tokens are never written unencrypted: without secure storage they stay in memory only.
 */
export class TokenStore implements TokenStorage {
  private memory: TokenSet | null = null;

  constructor(
    private readonly filePath: string,
    private readonly cipher: SecretCipher,
  ) {}

  get persistent(): boolean {
    return this.cipher.isAvailable();
  }

  async load(): Promise<TokenSet | null> {
    if (this.memory) return this.memory;
    if (!this.cipher.isAvailable()) return null;
    try {
      const plain = this.cipher.decrypt(await readFile(this.filePath));
      this.memory = tokenSetSchema.parse(JSON.parse(plain));
      return this.memory;
    } catch (error) {
      // A missing file just means "not signed in". Anything else is unreadable or tampered
      // data, so remove it rather than keep failing.
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') await this.removeFile();
      return null;
    }
  }

  async save(tokens: TokenSet): Promise<void> {
    this.memory = tokens;
    if (!this.cipher.isAvailable()) return;
    await mkdir(path.dirname(this.filePath), { recursive: true });
    const temp = `${this.filePath}.tmp`;
    // Write then rename so a crash never leaves a half-written file.
    await writeFile(temp, this.cipher.encrypt(JSON.stringify(tokens)), { mode: 0o600 });
    await rename(temp, this.filePath);
  }

  async clear(): Promise<void> {
    this.memory = null;
    await this.removeFile();
  }

  private async removeFile(): Promise<void> {
    await rm(this.filePath, { force: true });
  }
}
