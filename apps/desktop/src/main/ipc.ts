import { appSettingsSchema, type AppSettings } from '@accessdesk/shared';
import { ipcMain, type IpcMainInvokeEvent } from 'electron';
import { z } from 'zod';
import {
  IPC,
  type ConnectionTestResult,
  type LoginResult,
  type SettingsSaveResult,
} from '../shared/ipc';
import { apiPathSchema, type createApiClient } from './apiClient';
import { discover, OidcError } from './auth/oidc';
import { LoginCancelledError } from './auth/loopback';
import type { AuthService } from './auth/service';
import { originOf } from './security';
import type { SettingsStore } from './store/settingsStore';

interface IpcDeps {
  appOrigin: string;
  settings: SettingsStore;
  auth: AuthService;
  api: ReturnType<typeof createApiClient>;
}

const apiGetSchema = z.object({
  path: apiPathSchema,
  query: z.record(z.string().max(50), z.union([z.string().max(200), z.number()])).optional(),
});

const onboardingRetryCallSchema = z.object({ subjectId: z.string(), input: z.unknown() });

function describeIssues(error: z.ZodError): string {
  return error.issues.map((i) => `${i.path.join('.') || 'input'}: ${i.message}`).join('; ');
}

export function registerIpc(deps: IpcDeps): void {
  const handle = <A extends unknown[], R>(
    channel: string,
    fn: (...args: A) => Promise<R> | R,
  ): void => {
    ipcMain.handle(channel, (event: IpcMainInvokeEvent, ...args: unknown[]) => {
      const frame = event.senderFrame;
      const trusted =
        frame !== null &&
        frame === event.sender.mainFrame &&
        originOf(frame.url) === deps.appOrigin;
      if (!trusted) throw new Error('Untrusted sender');
      return fn(...(args as A));
    });
  };

  handle(IPC.settingsGet, () => deps.settings.load());

  handle(IPC.settingsSave, async (input: unknown): Promise<SettingsSaveResult> => {
    const parsed = appSettingsSchema.safeParse(input);
    if (!parsed.success) return { ok: false, message: describeIssues(parsed.error) };

    const previous = await deps.settings.load();
    await deps.settings.save(parsed.data);
    if (identityChanged(previous, parsed.data)) await deps.auth.clearSession();
    return { ok: true, settings: parsed.data };
  });

  handle(IPC.settingsTest, async (input: unknown): Promise<ConnectionTestResult> => {
    const parsed = appSettingsSchema.safeParse(input);
    if (!parsed.success) return { ok: false, message: describeIssues(parsed.error) };
    try {
      await discover(parsed.data);
      return {
        ok: true,
        message: `Connected to the identity provider at ${parsed.data.issuerUrl}`,
      };
    } catch (error) {
      return {
        ok: false,
        message:
          error instanceof OidcError
            ? error.message
            : 'Unexpected response from the identity provider',
      };
    }
  });

  handle(IPC.authStatus, () => deps.auth.status());

  handle(IPC.authLogin, async (): Promise<LoginResult> => {
    try {
      return { ok: true, status: await deps.auth.login() };
    } catch (error) {
      return {
        ok: false,
        cancelled: error instanceof LoginCancelledError,
        message: error instanceof Error ? error.message : 'Sign-in failed',
      };
    }
  });

  handle(IPC.authCancel, () => deps.auth.cancelLogin());
  handle(IPC.authLogout, () => deps.auth.logout());

  handle(IPC.apiGet, async (input: unknown) => {
    const parsed = apiGetSchema.safeParse(input);
    if (!parsed.success) return { ok: false, status: 400, message: 'Invalid request' } as const;
    return deps.api.get(parsed.data.path, parsed.data.query);
  });

  handle(IPC.apiOnboardingCreate, (input: unknown) => deps.api.createOnboarding(input));

  handle(IPC.apiOnboardingRetry, async (payload: unknown) => {
    const parsed = onboardingRetryCallSchema.safeParse(payload);
    if (!parsed.success) return { ok: false, status: 400, message: 'Invalid request' } as const;
    return deps.api.retryOnboarding(parsed.data.subjectId, parsed.data.input);
  });
}

function identityChanged(a: AppSettings | null, b: AppSettings): boolean {
  return !a || a.issuerUrl !== b.issuerUrl || a.clientId !== b.clientId;
}
