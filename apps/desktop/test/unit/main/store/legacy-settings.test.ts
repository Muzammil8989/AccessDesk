import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { migrateLegacySettings } from '../../../../src/main/store/legacy-settings';
import { SettingsStore } from '../../../../src/main/store/settingsStore';

const legacy = {
  keycloakUrl: 'http://localhost:8080/',
  realm: 'company-platform',
  clientId: 'accessdesk',
  apiUrl: 'http://localhost:4000',
};
const migrated = {
  issuerUrl: 'http://localhost:8080/realms/company-platform',
  clientId: 'accessdesk',
  apiUrl: 'http://localhost:4000',
};

describe('migrateLegacySettings', () => {
  it('turns a server URL and a realm into the issuer URL, dropping the old fields', () => {
    expect(migrateLegacySettings(legacy)).toEqual(migrated);
  });

  it('returns settings that already have an issuer URL untouched', () => {
    const current = { ...migrated };
    expect(migrateLegacySettings(current)).toBe(current);
  });

  it.each([
    ['a realm that could alter the URL path', { ...legacy, realm: '../master' }],
    ['a missing realm', { keycloakUrl: legacy.keycloakUrl, clientId: 'a', apiUrl: 'http://x' }],
    ['a non-string realm', { ...legacy, realm: 7 }],
    ['something that is not an object', 'text'],
    ['null', null],
    ['an array', []],
  ])('leaves %s as it is, so the setup wizard shows again', (_name, input) => {
    expect(migrateLegacySettings(input)).toBe(input);
  });
});

describe('SettingsStore with a settings file from an older version', () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), 'accessdesk-legacy-'));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('loads the old settings in the new shape and saves them that way', async () => {
    const file = path.join(dir, 'settings.json');
    await writeFile(file, JSON.stringify(legacy));

    expect(await new SettingsStore(file).load()).toEqual(migrated);

    expect(JSON.parse(await readFile(file, 'utf8'))).toEqual(migrated);
  });

  it('still loads when the migrated file cannot be written back', async () => {
    const file = path.join(dir, 'settings.json');
    await writeFile(file, JSON.stringify(legacy));
    const store = new SettingsStore(file);
    store.save = () => Promise.reject(new Error('read-only'));

    expect(await store.load()).toEqual(migrated);
  });

  it('shows the wizard again (null) when the old values cannot be migrated', async () => {
    const file = path.join(dir, 'settings.json');
    await writeFile(file, JSON.stringify({ ...legacy, realm: '../master' }));
    expect(await new SettingsStore(file).load()).toBeNull();
  });
});
