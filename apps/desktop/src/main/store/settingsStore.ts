import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { appSettingsSchema, type AppSettings } from '@accessdesk/shared';

/**
 * Local settings as plain JSON. Public values only (URLs, realm, client ID).
 * Secrets never belong here: the desktop app is a public OIDC client and has none.
 */
export class SettingsStore {
  constructor(private readonly filePath: string) {}

  /** Returns null on first run, or when the file is missing or no longer valid. */
  async load(): Promise<AppSettings | null> {
    try {
      const parsed = appSettingsSchema.safeParse(JSON.parse(await readFile(this.filePath, 'utf8')));
      return parsed.success ? parsed.data : null;
    } catch {
      return null;
    }
  }

  async save(settings: AppSettings): Promise<void> {
    await mkdir(path.dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify(settings, null, 2), 'utf8');
  }
}
