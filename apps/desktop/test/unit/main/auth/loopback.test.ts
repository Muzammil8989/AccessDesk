import net from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import {
  LoginCancelledError,
  startLoopback,
  type LoopbackSession,
} from '../../../../src/main/auth/loopback';

let session: LoopbackSession | undefined;
afterEach(() => session?.cancel());

async function start(timeoutMs?: number) {
  session = await startLoopback({ expectedState: 'good-state', timeoutMs });
  return session;
}

describe('loopback redirect listener', () => {
  it('binds to 127.0.0.1 on a random port and resolves with the code', async () => {
    const s = await start();
    expect(s.redirectUri).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/callback$/);

    const res = await fetch(`${s.redirectUri}?code=abc123&state=good-state`);
    expect(res.status).toBe(200);
    expect(res.headers.get('referrer-policy')).toBe('no-referrer');
    expect(res.headers.get('cache-control')).toBe('no-store');
    await expect(s.result).resolves.toBe('abc123');
  });

  it('ignores a wrong state without ending the login', async () => {
    const s = await start();
    const bad = await fetch(`${s.redirectUri}?code=evil&state=other`);
    expect(bad.status).toBe(400);

    await fetch(`${s.redirectUri}?code=real&state=good-state`);
    await expect(s.result).resolves.toBe('real');
  });

  it('serves nothing except /callback', async () => {
    const s = await start();
    const base = s.redirectUri.replace('/callback', '');
    expect((await fetch(`${base}/`)).status).toBe(404);
    expect((await fetch(`${base}/callback/extra?state=good-state&code=x`)).status).toBe(404);
    s.cancel();
    await expect(s.result).rejects.toBeInstanceOf(LoginCancelledError);
  });

  it('rejects when Keycloak returns an error', async () => {
    const s = await start();
    await fetch(`${s.redirectUri}?error=access_denied&state=good-state`);
    await expect(s.result).rejects.toThrow('access_denied');
  });

  it('stops listening after the first valid response', async () => {
    const s = await start();
    await fetch(`${s.redirectUri}?code=once&state=good-state`);
    await s.result;
    await expect(fetch(`${s.redirectUri}?code=twice&state=good-state`)).rejects.toThrow();
  });

  // Regression: a browser reusing its connection (favicon, retry) after sign-in finished used to
  // crash the main process with "Cannot read properties of null (reading 'port')".
  it('answers a second request on the same connection without crashing', async () => {
    const s = await start();
    const port = new URL(s.redirectUri).port;
    const request = (code: string) =>
      `GET /callback?code=${code}&state=good-state HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\n\r\n`;

    const raw = await new Promise<string>((resolve, reject) => {
      const socket = net.connect(Number(port), '127.0.0.1');
      let data = '';
      socket.on('data', (chunk) => {
        data += chunk.toString();
        if ((data.match(/HTTP\/1\.1 \d{3}/g) ?? []).length === 2) {
          socket.destroy();
          resolve(data);
        }
      });
      socket.on('error', reject);
      socket.write(request('first') + request('second'));
    });

    const statuses = [...raw.matchAll(/HTTP\/1\.1 (\d{3})/g)].map((m) => m[1]);
    expect(statuses).toEqual(['200', '410']);
    await expect(s.result).resolves.toBe('first');
  });

  it('times out', async () => {
    const s = await start(30);
    await expect(s.result).rejects.toThrow('timed out');
  });

  it('can be cancelled', async () => {
    const s = await start();
    s.cancel();
    await expect(s.result).rejects.toBeInstanceOf(LoginCancelledError);
  });
});
