import { BrowserWindow } from 'electron';

export function createMainWindow(options: {
  appUrl: string;
  preloadPath: string;
  devTools: boolean;
}): BrowserWindow {
  const window = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    show: false,
    title: 'AccessDesk',
    webPreferences: {
      preload: options.preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      devTools: options.devTools,
      // Usernames and emails are not prose; skipping the dictionaries saves memory and start-up time.
      spellcheck: false,
    },
  });

  // No File / Edit / View / Window bar. Only Windows and Linux show a menu in the window; on macOS
  // the application menu lives outside it and stays, because copy and paste need its Edit menu.
  window.removeMenu();
  window.once('ready-to-show', () => window.show());
  void window.loadURL(options.appUrl);
  return window;
}
