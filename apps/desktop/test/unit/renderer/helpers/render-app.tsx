import type { AppSettings } from '@accessdesk/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { createMemoryRouter, MemoryRouter, RouterProvider, type RouteObject } from 'react-router';
import { vi } from 'vitest';
import type {
  AccessDeskApi,
  ApiResponse,
  AuthStatus,
  ConnectionTestResult,
  LoginResult,
  SettingsSaveResult,
} from '../../../../src/shared/ipc';

export const settings: AppSettings = {
  issuerUrl: 'http://localhost:8080/realms/company-platform',
  clientId: 'accessdesk',
  apiUrl: 'http://localhost:4000',
};

export const adminAuth: AuthStatus = {
  authenticated: true,
  username: 'hana',
  displayName: 'Hana HR',
  roles: ['hr-admin', 'offline_access'],
  adminRoles: ['super-admin', 'hr-admin'],
  superAdminRole: 'super-admin',
  persistent: true,
};

export const superAdminAuth: AuthStatus = {
  authenticated: true,
  username: 'superadmin1',
  displayName: 'Sam Super',
  roles: ['super-admin', 'offline_access'],
  adminRoles: ['super-admin', 'hr-admin'],
  superAdminRole: 'super-admin',
  persistent: true,
};

export const memberAuth: AuthStatus = {
  authenticated: true,
  username: 'member1',
  displayName: 'Member One',
  roles: ['offline_access', 'default-roles-company-platform'],
  adminRoles: ['super-admin', 'hr-admin'],
  superAdminRole: 'super-admin',
  persistent: true,
};

export const signedOut: AuthStatus = {
  authenticated: false,
  username: null,
  displayName: null,
  roles: [],
  adminRoles: ['super-admin', 'hr-admin'],
  superAdminRole: 'super-admin',
  persistent: true,
};

export interface FakeApiOptions {
  settings?: AppSettings | null;
  auth?: AuthStatus;
  apiGet?: (path: string, query?: Record<string, string | number>) => Promise<ApiResponse>;
  onboardingCreate?: (input: unknown) => Promise<ApiResponse>;
  onboardingRetry?: (subjectId: string, input: unknown) => Promise<ApiResponse>;
  checklistSetItem?: (subjectId: string, itemId: string, input: unknown) => Promise<ApiResponse>;
  checklistSetClosed?: (subjectId: string, input: unknown) => Promise<ApiResponse>;
  login?: () => Promise<LoginResult>;
  saveSettings?: (input: unknown) => Promise<SettingsSaveResult>;
  testConnection?: (input: unknown) => Promise<ConnectionTestResult>;
}

export function installFakeApi(options: FakeApiOptions = {}) {
  let auth = options.auth ?? adminAuth;
  const api = {
    settings: {
      get: vi.fn(async () => (options.settings === undefined ? settings : options.settings)),
      save: vi.fn(
        options.saveSettings ??
          (async (input: unknown) => ({ ok: true, settings: input as AppSettings }) as const),
      ),
      testConnection: vi.fn(
        options.testConnection ?? (async () => ({ ok: true, message: 'Connected' })),
      ),
    },
    auth: {
      status: vi.fn(async () => auth),
      login: vi.fn(options.login ?? (async () => ({ ok: true, status: auth }) as const)),
      cancelLogin: vi.fn(async () => undefined),
      logout: vi.fn(async () => {
        auth = signedOut;
        return auth;
      }),
    },
    api: {
      get: vi.fn(
        options.apiGet ??
          (async (): Promise<ApiResponse> => ({ ok: false, status: 404, message: 'not set up' })),
      ),
      onboarding: {
        create: vi.fn(
          options.onboardingCreate ??
            (async (): Promise<ApiResponse> => ({ ok: false, status: 404, message: 'not set up' })),
        ),
        retry: vi.fn(
          options.onboardingRetry ??
            (async (): Promise<ApiResponse> => ({ ok: false, status: 404, message: 'not set up' })),
        ),
      },
      checklists: {
        setClosed: vi.fn(
          options.checklistSetClosed ??
            (async (): Promise<ApiResponse> => ({ ok: false, status: 404, message: 'not set up' })),
        ),
        setItem: vi.fn(
          options.checklistSetItem ??
            (async (): Promise<ApiResponse> => ({ ok: false, status: 404, message: 'not set up' })),
        ),
      },
    },
  } satisfies AccessDeskApi;

  (window as unknown as { accessdesk: AccessDeskApi }).accessdesk = api;
  return api;
}

function newQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

export function renderWithProviders(ui: ReactElement) {
  return render(
    <QueryClientProvider client={newQueryClient()}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

export function renderRoutes(routes: RouteObject[], initialPath: string) {
  const router = createMemoryRouter(routes, { initialEntries: [initialPath] });
  const result = render(
    <QueryClientProvider client={newQueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { ...result, router };
}

export const employee = (n: number, overrides: Record<string, unknown> = {}) => ({
  id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
  username: `user${n}`,
  email: `user${n}@example.com`,
  firstName: 'User',
  lastName: String(n),
  enabled: true,
  emailVerified: true,
  createdAt: null,
  ...overrides,
});
