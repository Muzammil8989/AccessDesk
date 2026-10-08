import path from 'node:path';
import type { Session } from 'electron';

export const APP_SCHEME = 'app';
export const APP_HOST = 'accessdesk';
export const APP_ORIGIN = `${APP_SCHEME}://${APP_HOST}`;

export function originOf(url: string): string | null {
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return null;
  }
}

export function isAllowedNavigation(url: string, appOrigin: string): boolean {
  return originOf(url) === appOrigin;
}

/**
 * The only permission AccessDesk grants: writing text to the clipboard, so "Copy" works on the
 * one-time password. It is the "sanitized write" kind (plain text and images, no markup), and it
 * does not include reading the clipboard.
 */
export const CLIPBOARD_WRITE_PERMISSION = 'clipboard-sanitized-write';

export function isPermissionAllowed(
  permission: string,
  requestingUrl: string,
  isMainFrame: boolean,
  appOrigin: string,
): boolean {
  return (
    permission === CLIPBOARD_WRITE_PERMISSION &&
    isMainFrame &&
    originOf(requestingUrl) === appOrigin
  );
}

/** Deny every permission request and check except the clipboard write above, for our own window. */
export function installPermissionHandlers(
  ses: Pick<Session, 'setPermissionRequestHandler' | 'setPermissionCheckHandler'>,
  appOrigin: string,
): void {
  ses.setPermissionRequestHandler((_contents, permission, callback, details) =>
    callback(
      isPermissionAllowed(permission, details.requestingUrl, details.isMainFrame, appOrigin),
    ),
  );
  ses.setPermissionCheckHandler((_contents, permission, requestingOrigin, details) =>
    isPermissionAllowed(
      permission,
      details.requestingUrl ?? requestingOrigin,
      details.isMainFrame,
      appOrigin,
    ),
  );
}

export function buildCsp(devServerOrigin?: string): string {
  const dev = devServerOrigin !== undefined;
  const directives: Record<string, string> = {
    'default-src': "'none'",
    'script-src': dev ? "'self' 'unsafe-inline'" : "'self'",
    'style-src': dev ? "'self' 'unsafe-inline'" : "'self'",
    'img-src': "'self' data:",
    'font-src': "'self'",
    'connect-src': dev ? `'self' ${devServerOrigin.replace(/^http/, 'ws')}` : "'none'",
    'base-uri': "'none'",
    'form-action': "'none'",
    'frame-ancestors': "'none'",
    'object-src': "'none'",
  };
  return Object.entries(directives)
    .map(([name, value]) => `${name} ${value}`)
    .join('; ');
}

export function resolveAppFile(rendererDir: string, pathname: string): string | null {
  let relative: string;
  try {
    relative = decodeURIComponent(pathname === '/' ? '/index.html' : pathname);
  } catch {
    return null;
  }
  if (relative.includes('\0')) return null;
  const root = path.resolve(rendererDir);
  const resolved = path.resolve(root, `.${relative}`);
  return resolved.startsWith(root + path.sep) ? resolved : null;
}
