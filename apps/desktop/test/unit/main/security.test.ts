import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  APP_ORIGIN,
  buildCsp,
  isAllowedNavigation,
  originOf,
  resolveAppFile,
} from '../../../src/main/security';

describe('navigation allowlist', () => {
  it('allows only the app origin', () => {
    expect(isAllowedNavigation(`${APP_ORIGIN}/index.html#/employees`, APP_ORIGIN)).toBe(true);
    expect(isAllowedNavigation('https://evil.example/', APP_ORIGIN)).toBe(false);
    expect(isAllowedNavigation('app://other-host/', APP_ORIGIN)).toBe(false);
    expect(isAllowedNavigation('file:///etc/passwd', APP_ORIGIN)).toBe(false);
    expect(isAllowedNavigation('not a url', APP_ORIGIN)).toBe(false);
  });

  it('includes the port for the dev server origin', () => {
    expect(originOf('http://localhost:5173/src/main.tsx')).toBe('http://localhost:5173');
    expect(isAllowedNavigation('http://localhost:9999/', 'http://localhost:5173')).toBe(false);
  });
});

describe('Content Security Policy', () => {
  it('production policy has no inline code, no remote origins and no network access', () => {
    const csp = buildCsp();
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain("connect-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).not.toContain('unsafe');
    expect(csp).not.toContain('http');
  });

  it('dev policy only adds what hot reload needs', () => {
    const csp = buildCsp('http://localhost:5173');
    expect(csp).toContain("script-src 'self' 'unsafe-inline'");
    expect(csp).toContain("connect-src 'self' ws://localhost:5173");
  });
});

describe('resolveAppFile', () => {
  const root = path.resolve('/app/renderer');

  it('maps / to index.html and normal assets inside the directory', () => {
    expect(resolveAppFile(root, '/')).toBe(path.join(root, 'index.html'));
    expect(resolveAppFile(root, '/assets/app.js')).toBe(path.join(root, 'assets', 'app.js'));
  });

  it.each(['/../secret.txt', '/..%2Fsecret.txt', '/assets/../../secret.txt', '/%2e%2e/secret.txt'])(
    'blocks path traversal: %s',
    (p) => expect(resolveAppFile(root, p)).toBeNull(),
  );

  it('rejects malformed encoding and null bytes', () => {
    expect(resolveAppFile(root, '/%E0%A4%A')).toBeNull();
    expect(resolveAppFile(root, '/a%00b')).toBeNull();
  });
});
