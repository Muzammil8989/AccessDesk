import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadAccessPolicy } from '@accessdesk/identity';
import dotenv from 'dotenv';
import { app, BrowserWindow, dialog, net, protocol, safeStorage, session, shell } from 'electron';
import { createApiClient } from './apiClient';
import { AuthService } from './auth/service';
import { registerIpc } from './ipc';
import {
  APP_HOST,
  APP_ORIGIN,
  APP_SCHEME,
  buildCsp,
  installPermissionHandlers,
  isAllowedNavigation,
  originOf,
  resolveAppFile,
} from './security';
import { SettingsStore } from './store/settingsStore';
import { TokenStore, type SecretCipher } from './store/tokenStore';
import { createMainWindow } from './window';

dotenv.config({ path: path.resolve(__dirname, '../../../../.env'), quiet: true });

const devServerUrl = process.env['ELECTRON_RENDERER_URL'];
const devServerOrigin = devServerUrl ? originOf(devServerUrl) : null;
const appOrigin = devServerOrigin ?? APP_ORIGIN;

app.enableSandbox();
protocol.registerSchemesAsPrivileged([
  { scheme: APP_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

if (!app.requestSingleInstanceLock()) app.quit();

app.on('web-contents-created', (_event, contents) => {
  contents.on('will-navigate', (event, url) => {
    if (!isAllowedNavigation(url, appOrigin)) event.preventDefault();
  });
  contents.setWindowOpenHandler(() => ({ action: 'deny' }));
  contents.on('will-attach-webview', (event) => event.preventDefault());
});

const cipher: SecretCipher = {
  isAvailable: () =>
    safeStorage.isEncryptionAvailable() &&
    !(process.platform === 'linux' && safeStorage.getSelectedStorageBackend() === 'basic_text'),
  encrypt: (plain) => safeStorage.encryptString(plain),
  decrypt: (data) => safeStorage.decryptString(data),
};

async function openInSystemBrowser(url: string): Promise<void> {
  const { protocol: scheme } = new URL(url);
  if (scheme !== 'https:' && scheme !== 'http:') throw new Error('Refusing to open a non-web URL');
  await shell.openExternal(url);
}

function serveRendererFromAppScheme(): void {
  const rendererDir = path.join(__dirname, '../renderer');
  const csp = buildCsp();
  protocol.handle(APP_SCHEME, async (request) => {
    const url = new URL(request.url);
    const file = url.host === APP_HOST ? resolveAppFile(rendererDir, url.pathname) : null;
    if (!file) return new Response('Not found', { status: 404 });

    const upstream = await net.fetch(pathToFileURL(file).toString());
    const headers = new Headers(upstream.headers);
    headers.set('Content-Security-Policy', csp);
    return new Response(upstream.body, { status: upstream.status, headers });
  });
}

function addDevServerCsp(origin: string): void {
  const csp = buildCsp(origin);
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const headers = details.responseHeaders ?? {};
    if (originOf(details.url) === origin) headers['Content-Security-Policy'] = [csp];
    callback({ responseHeaders: headers });
  });
}

void app.whenReady().then(() => {
  installPermissionHandlers(session.defaultSession, appOrigin);

  if (devServerOrigin) addDevServerCsp(devServerOrigin);
  else serveRendererFromAppScheme();

  let policy: ReturnType<typeof loadAccessPolicy>;
  try {
    policy = loadAccessPolicy(process.env);
  } catch (error) {
    dialog.showErrorBox(
      'AccessDesk cannot start',
      error instanceof Error ? error.message : 'Invalid access configuration',
    );
    app.exit(1);
    return;
  }

  const userData = app.getPath('userData');
  const settings = new SettingsStore(path.join(userData, 'settings.json'));
  const tokenStore = new TokenStore(path.join(userData, 'session.bin'), cipher);
  const auth = new AuthService({
    getSettings: () => settings.load(),
    policy,
    tokenStore,
    openExternal: openInSystemBrowser,
  });
  const api = createApiClient({ getSettings: () => settings.load(), auth });
  registerIpc({ appOrigin, settings, auth, api });

  const openWindow = () =>
    createMainWindow({
      appUrl: devServerUrl ?? `${APP_ORIGIN}/index.html`,
      preloadPath: path.join(__dirname, '../preload/index.js'),
      devTools: !app.isPackaged,
    });
  openWindow();

  app.on('second-instance', () => {
    const [window] = BrowserWindow.getAllWindows();
    if (!window) return;
    if (window.isMinimized()) window.restore();
    window.focus();
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) openWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
