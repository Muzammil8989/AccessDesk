import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { appSettingsSchema, type AppSettings } from '@accessdesk/shared';
import { migrateLegacySettings } from './legacy-settings';

export class SettingsStore {
  constructor(private readonly filePath: string) {}

  async load(): Promise<AppSettings | null> {
    try {
      const raw: unknown = JSON.parse(await readFile(this.filePath, 'utf8'));
      const migrated = migrateLegacySettings(raw);
      const parsed = appSettingsSchema.safeParse(migrated);
      if (!parsed.success) return null;
      if (migrated !== raw) await this.save(parsed.data).catch(() => undefined);
      return parsed.data;
    } catch {
      return null;
    }
  }

  async save(settings: AppSettings): Promise<void> {
    await mkdir(path.dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify(settings, null, 2), 'utf8');
  }
}
