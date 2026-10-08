import path from 'node:path';
import type { Session } from 'electron';
import { describe, expect, it, vi } from 'vitest';
import {
  APP_ORIGIN,
  buildCsp,
  CLIPBOARD_WRITE_PERMISSION,
  installPermissionHandlers,
  isAllowedNavigation,
  isPermissionAllowed,
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

describe('permissions', () => {
  const page = `${APP_ORIGIN}/index.html#/onboard`;

  it('allows exactly one permission: writing to the clipboard, from the app window', () => {
    expect(CLIPBOARD_WRITE_PERMISSION).toBe('clipboard-sanitized-write');
    expect(isPermissionAllowed('clipboard-sanitized-write', page, true, APP_ORIGIN)).toBe(true);
  });

  it.each([
    'clipboard-read',
    'geolocation',
    'notifications',
    'media',
    'mediaKeySystem',
    'midi',
    'midiSysex',
    'display-capture',
    'fullscreen',
    'openExternal',
    'pointerLock',
    'idle-detection',
    'unknown-future-permission',
    '',
  ])('still denies %j', (permission) => {
    expect(isPermissionAllowed(permission, page, true, APP_ORIGIN)).toBe(false);
  });

  it('does not let clipboard write through for any other origin or frame', () => {
    const write = 'clipboard-sanitized-write';
    expect(isPermissionAllowed(write, 'https://evil.example/', true, APP_ORIGIN)).toBe(false);
    expect(isPermissionAllowed(write, 'app://other-host/', true, APP_ORIGIN)).toBe(false);
    expect(isPermissionAllowed(write, 'file:///c:/x.html', true, APP_ORIGIN)).toBe(false);
    expect(isPermissionAllowed(write, 'not a url', true, APP_ORIGIN)).toBe(false);
    expect(isPermissionAllowed(write, '', true, APP_ORIGIN)).toBe(false);
    expect(isPermissionAllowed(write, page, false, APP_ORIGIN)).toBe(false);
  });

  it('follows the dev server origin in development, and not the app scheme then', () => {
    const dev = 'http://localhost:5173';
    const write = 'clipboard-sanitized-write';
    expect(isPermissionAllowed(write, `${dev}/#/onboard`, true, dev)).toBe(true);
    expect(isPermissionAllowed(write, page, true, dev)).toBe(false);
    expect(isPermissionAllowed(write, 'http://localhost:9999/', true, dev)).toBe(false);
  });

  describe('installed on a session', () => {
    function install(appOrigin = APP_ORIGIN) {
      let request!: Parameters<Session['setPermissionRequestHandler']>[0] & object;
      let check!: Parameters<Session['setPermissionCheckHandler']>[0] & object;
      installPermissionHandlers(
        {
          setPermissionRequestHandler: (handler) => void (request = handler!),
          setPermissionCheckHandler: (handler) => void (check = handler!),
        },
        appOrigin,
      );
      const ask = (permission: string, requestingUrl: string, isMainFrame = true) => {
        const callback = vi.fn();
        request(null as never, permission as never, callback, {
          requestingUrl,
          isMainFrame,
        });
        expect(callback).toHaveBeenCalledTimes(1);
        return callback.mock.calls[0]![0] as boolean;
      };
      const probe = (permission: string, origin: string, details: object) =>
        check(null, permission as never, origin, details as never);
      return { ask, probe };
    }

    it('answers permission requests: the clipboard write yes, everything else no', () => {
      const { ask } = install();

      expect(ask('clipboard-sanitized-write', page)).toBe(true);
      expect(ask('clipboard-read', page)).toBe(false);
      expect(ask('geolocation', page)).toBe(false);
      expect(ask('notifications', page)).toBe(false);
      expect(ask('clipboard-sanitized-write', 'https://evil.example/')).toBe(false);
      expect(ask('clipboard-sanitized-write', page, false)).toBe(false);
    });

    it('answers permission checks the same way, which is what navigator.permissions reports', () => {
      const { probe } = install();
      const details = { requestingUrl: page, isMainFrame: true };

      expect(probe('clipboard-sanitized-write', APP_ORIGIN, details)).toBe(true);
      expect(probe('clipboard-read', APP_ORIGIN, details)).toBe(false);
      expect(probe('geolocation', APP_ORIGIN, details)).toBe(false);
      expect(
        probe('clipboard-sanitized-write', 'https://evil.example', {
          ...details,
          requestingUrl: 'https://evil.example/',
        }),
      ).toBe(false);
    });

    it('falls back to the requesting origin when a check carries no URL', () => {
      const { probe } = install();

      expect(probe('clipboard-sanitized-write', `${APP_ORIGIN}/`, { isMainFrame: true })).toBe(
        true,
      );
      expect(
        probe('clipboard-sanitized-write', 'https://evil.example/', { isMainFrame: true }),
      ).toBe(false);
    });
  });
});
