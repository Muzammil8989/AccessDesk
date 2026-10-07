import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import type { TokenSet } from '../auth/oidc';

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

export interface TokenStorage {
  readonly persistent: boolean;
  load(): Promise<TokenSet | null>;
  save(tokens: TokenSet): Promise<void>;
  clear(): Promise<void>;
}

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
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') await this.removeFile();
      return null;
    }
  }

  async save(tokens: TokenSet): Promise<void> {
    this.memory = tokens;
    if (!this.cipher.isAvailable()) return;
    await mkdir(path.dirname(this.filePath), { recursive: true });
    const temp = `${this.filePath}.tmp`;
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
