import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { app, BrowserWindow, net, protocol, safeStorage, session, shell } from 'electron';
import { createApiClient } from './apiClient';
import { AuthService } from './auth/service';
import { registerIpc } from './ipc';
import {
  APP_HOST,
  APP_ORIGIN,
  APP_SCHEME,
  buildCsp,
  isAllowedNavigation,
  originOf,
  resolveAppFile,
} from './security';
import { SettingsStore } from './store/settingsStore';
import { TokenStore, type SecretCipher } from './store/tokenStore';
import { createMainWindow } from './window';

// Set by electron-vite when running `pnpm dev`. Absent in a built or packaged app.
const devServerUrl = process.env['ELECTRON_RENDERER_URL'];
const devServerOrigin = devServerUrl ? originOf(devServerUrl) : null;
const appOrigin = devServerOrigin ?? APP_ORIGIN;

app.enableSandbox();
protocol.registerSchemesAsPrivileged([
  { scheme: APP_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

// Only one copy may run: two instances would fight over the token file.
if (!app.requestSingleInstanceLock()) app.quit();

// Defence in depth for every web contents we ever create.
app.on('web-contents-created', (_event, contents) => {
  contents.on('will-navigate', (event, url) => {
    if (!isAllowedNavigation(url, appOrigin)) event.preventDefault();
  });
  contents.setWindowOpenHandler(() => ({ action: 'deny' }));
  contents.on('will-attach-webview', (event) => event.preventDefault());
});

// Windows DPAPI, macOS Keychain or Linux libsecret. On Linux the "basic_text" fallback is
// not real protection, so it is treated as unavailable.
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
  // The app needs no camera, microphone, notifications and so on.
  session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) =>
    callback(false),
  );
  session.defaultSession.setPermissionCheckHandler(() => false);

  if (devServerOrigin) addDevServerCsp(devServerOrigin);
  else serveRendererFromAppScheme();

  const userData = app.getPath('userData');
  const settings = new SettingsStore(path.join(userData, 'settings.json'));
  const tokenStore = new TokenStore(path.join(userData, 'session.bin'), cipher);
  const auth = new AuthService({
    getSettings: () => settings.load(),
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

  // macOS: clicking the dock icon with no window open.
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) openWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
