import { describe, expect, it } from 'vitest';
import {
  createCodeChallenge,
  createCodeVerifier,
  createState,
} from '../../../../src/main/auth/pkce';

describe('PKCE', () => {
  it('matches the RFC 7636 appendix B test vector', () => {
    expect(createCodeChallenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')).toBe(
      'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
    );
  });

  it('creates URL-safe verifiers of valid length, different every time', () => {
    const a = createCodeVerifier();
    const b = createCodeVerifier();
    expect(a).toMatch(/^[A-Za-z0-9_-]{43,128}$/);
    expect(a).not.toBe(b);
  });

  it('creates unguessable state values', () => {
    expect(createState()).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(createState()).not.toBe(createState());
  });
});
