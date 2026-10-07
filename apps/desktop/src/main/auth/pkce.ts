import { createHash, randomBytes } from 'node:crypto';

const base64Url = (buffer: Buffer) => buffer.toString('base64url');

export function createCodeVerifier(): string {
  return base64Url(randomBytes(32));
}

export function createCodeChallenge(verifier: string): string {
  return base64Url(createHash('sha256').update(verifier).digest());
}

export function createState(): string {
  return base64Url(randomBytes(16));
}
