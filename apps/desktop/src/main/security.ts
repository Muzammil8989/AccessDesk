import path from 'node:path';

// In production the UI is served from a custom scheme we control, not from file://.
// That gives the page a real origin to check and lets us attach a CSP header.
export const APP_SCHEME = 'app';
export const APP_HOST = 'accessdesk';
export const APP_ORIGIN = `${APP_SCHEME}://${APP_HOST}`;

/** Compares scheme + host + port. `URL.origin` is "null" for custom schemes, so build it by hand. */
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
 * Strict policy: only our own scripts and styles, nothing loaded from the network, no frames,
 * no forms. The renderer never calls a server directly. Everything goes through IPC to main.
 * The dev server needs inline scripts and a WebSocket for hot reload, so it gets a looser policy.
 */
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

/**
 * Maps a request path to a file inside `rendererDir`, or null when it would escape it
 * (path traversal) or is malformed.
 */
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
