// The contract between the renderer (untrusted UI) and the main process.
// Types only plus channel names: no runtime dependencies, so the sandboxed preload stays tiny.
import type { AppSettings } from '@accessdesk/shared';

export const IPC = {
  settingsGet: 'settings:get',
  settingsSave: 'settings:save',
  settingsTest: 'settings:test',
  authStatus: 'auth:status',
  authLogin: 'auth:login',
  authCancel: 'auth:cancel',
  authLogout: 'auth:logout',
  apiGet: 'api:get',
} as const;

export interface AuthStatus {
  authenticated: boolean;
  username: string | null;
  displayName: string | null;
  roles: string[];
  /** False when the OS secure storage is unavailable: the session then lives in memory only. */
  persistent: boolean;
}

export type SettingsSaveResult =
  { ok: true; settings: AppSettings } | { ok: false; message: string };

export interface ConnectionTestResult {
  ok: boolean;
  message: string;
}

export type LoginResult =
  { ok: true; status: AuthStatus } | { ok: false; message: string; cancelled: boolean };

/** The renderer never sees a token: main attaches it and returns only the response body. */
export type ApiResponse =
  { ok: true; status: number; data: unknown } | { ok: false; status: number; message: string };

export type ApiQuery = Record<string, string | number>;

export interface AccessDeskApi {
  settings: {
    get(): Promise<AppSettings | null>;
    save(input: unknown): Promise<SettingsSaveResult>;
    testConnection(input: unknown): Promise<ConnectionTestResult>;
  };
  auth: {
    status(): Promise<AuthStatus>;
    login(): Promise<LoginResult>;
    cancelLogin(): Promise<void>;
    logout(): Promise<AuthStatus>;
  };
  api: {
    get(path: string, query?: ApiQuery): Promise<ApiResponse>;
  };
}
