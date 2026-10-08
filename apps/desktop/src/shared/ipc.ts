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
  apiOnboardingCreate: 'api:onboarding-create',
  apiOnboardingRetry: 'api:onboarding-retry',
} as const;

export interface AuthStatus {
  authenticated: boolean;
  username: string | null;
  displayName: string | null;
  roles: string[];
  adminRoles: string[];
  superAdminRole: string;
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

export type ApiResponse =
  | { ok: true; status: number; data: unknown }
  | { ok: false; status: number; message: string; code?: string };

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
    onboarding: {
      create(input: unknown): Promise<ApiResponse>;
      retry(subjectId: string, input: unknown): Promise<ApiResponse>;
    };
  };
}
