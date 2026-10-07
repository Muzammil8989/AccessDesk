import path from 'node:path';

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
