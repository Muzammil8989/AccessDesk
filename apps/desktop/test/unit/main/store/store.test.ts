import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { TokenSet } from '../../../../src/main/auth/oidc';
import { SettingsStore } from '../../../../src/main/store/settingsStore';
import { TokenStore, type SecretCipher } from '../../../../src/main/store/tokenStore';

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), 'accessdesk-test-'));
});
afterEach(() => rm(dir, { recursive: true, force: true }));

const fakeCipher = (available = true): SecretCipher => ({
  isAvailable: () => available,
  encrypt: (plain) => Buffer.from(`ENC:${Buffer.from(plain).toString('hex')}`),
  decrypt: (data) => {
    const text = data.toString();
    if (!text.startsWith('ENC:')) throw new Error('bad data');
    return Buffer.from(text.slice(4), 'hex').toString();
  },
});

const tokens: TokenSet = {
  accessToken: 'secret-access',
  refreshToken: 'secret-refresh',
  expiresAt: 123,
};

describe('TokenStore', () => {
  it('never writes tokens to disk in plain text', async () => {
    const file = path.join(dir, 'session.bin');
    await new TokenStore(file, fakeCipher()).save(tokens);
    const onDisk = await readFile(file, 'utf8');
    expect(onDisk).not.toContain('secret-access');
    expect(onDisk).not.toContain('secret-refresh');
  });

  it('restores the session after a restart', async () => {
    const file = path.join(dir, 'session.bin');
    await new TokenStore(file, fakeCipher()).save(tokens);
    expect(await new TokenStore(file, fakeCipher()).load()).toEqual(tokens);
  });

  it('keeps tokens in memory only when secure storage is unavailable', async () => {
    const file = path.join(dir, 'session.bin');
    const store = new TokenStore(file, fakeCipher(false));
    await store.save(tokens);

    expect(store.persistent).toBe(false);
    expect(await store.load()).toEqual(tokens);
    await expect(readFile(file)).rejects.toMatchObject({ code: 'ENOENT' });
    expect(await new TokenStore(file, fakeCipher(false)).load()).toBeNull();
  });

  it('discards a corrupted file instead of failing forever', async () => {
    const file = path.join(dir, 'session.bin');
    await writeFile(file, 'garbage');
    const store = new TokenStore(file, fakeCipher());
    expect(await store.load()).toBeNull();
    await expect(readFile(file)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('clears memory and disk', async () => {
    const file = path.join(dir, 'session.bin');
    const store = new TokenStore(file, fakeCipher());
    await store.save(tokens);
    await store.clear();
    expect(await store.load()).toBeNull();
    expect(await new TokenStore(file, fakeCipher()).load()).toBeNull();
  });
});

describe('SettingsStore', () => {
  const valid = {
    keycloakUrl: 'http://localhost:8080',
    realm: 'company-platform',
    clientId: 'accessdesk',
    apiUrl: 'http://localhost:4000',
  };

  it('returns null on first run', async () => {
    expect(await new SettingsStore(path.join(dir, 'settings.json')).load()).toBeNull();
  });

  it('round-trips settings', async () => {
    const store = new SettingsStore(path.join(dir, 'nested', 'settings.json'));
    await store.save(valid);
    expect(await store.load()).toEqual(valid);
  });

  it('treats an invalid file as not configured', async () => {
    const file = path.join(dir, 'settings.json');
    await writeFile(file, JSON.stringify({ ...valid, realm: '../master' }));
    expect(await new SettingsStore(file).load()).toBeNull();
  });
});
