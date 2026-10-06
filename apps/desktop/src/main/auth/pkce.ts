import { createHash, randomBytes } from 'node:crypto';

const base64Url = (buffer: Buffer) => buffer.toString('base64url');

/** 32 random bytes give a 43-character verifier, the minimum RFC 7636 allows. */
export function createCodeVerifier(): string {
  return base64Url(randomBytes(32));
}

export function createCodeChallenge(verifier: string): string {
  return base64Url(createHash('sha256').update(verifier).digest());
}

/** Binds the browser callback to this login attempt (CSRF protection). */
export function createState(): string {
  return base64Url(randomBytes(16));
}
