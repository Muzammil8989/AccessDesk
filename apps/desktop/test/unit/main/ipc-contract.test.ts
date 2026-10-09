import { readFileSync } from 'node:fs';
import path from 'node:path';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { IPC, type AccessDeskApi } from '../../../src/shared/ipc';

/**
 * The IPC contract has three sides that must agree: the channel names in src/shared/ipc.ts, the
 * preload that invokes them, and the main process that handles them. A channel missing from any
 * side fails only at runtime ("No handler registered for ..."), and only on the screen that uses
 * it. These tests wire the real preload to the real registerIpc through a fake Electron that
 * behaves like the real one, so that mismatch fails here instead.
 */

type Handler = (event: unknown, ...args: unknown[]) => unknown;

const electron = vi.hoisted(() => {
  const handlers = new Map<string, Handler>();
  const registrations: string[] = [];
  const invoked: string[] = [];
  const exposed: Record<string, unknown> = {};
  const frame = { url: 'app://accessdesk/index.html' };
  const event = { senderFrame: frame, sender: { mainFrame: frame } };
  return {
    handlers,
    registrations,
    invoked,
    exposed,
    event,
    ipcMain: {
      handle: (channel: string, handler: Handler) => {
        registrations.push(channel);
        // Electron throws on a second handler for the same channel.
        if (handlers.has(channel)) {
          throw new Error(`Attempted to register a second handler for '${channel}'`);
        }
        handlers.set(channel, handler);
      },
    },
    ipcRenderer: {
      // Mirrors Electron: an unhandled channel rejects, it does not return undefined.
      invoke: async (channel: string, ...args: unknown[]) => {
        invoked.push(channel);
        const handler = handlers.get(channel);
        if (!handler) {
          throw new Error(
            `Error invoking remote method '${channel}': Error: No handler registered for '${channel}'`,
          );
        }
        return handler(event, ...args);
      },
    },
    contextBridge: {
      exposeInMainWorld: (key: string, api: unknown) => {
        exposed[key] = api;
      },
    },
  };
});

vi.mock('electron', () => ({
  ipcMain: electron.ipcMain,
  ipcRenderer: electron.ipcRenderer,
  contextBridge: electron.contextBridge,
}));

const ok = { ok: true, status: 200, data: {} } as const;

function fakeDeps() {
  return {
    appOrigin: 'app://accessdesk',
    settings: { load: vi.fn(async () => null), save: vi.fn(async () => undefined) },
    auth: {
      status: vi.fn(async () => ({ authenticated: false })),
      login: vi.fn(async () => ({ authenticated: false })),
      cancelLogin: vi.fn(() => undefined),
      logout: vi.fn(async () => ({ authenticated: false })),
      clearSession: vi.fn(async () => undefined),
    },
    api: {
      get: vi.fn(async () => ok),
      createOnboarding: vi.fn(async () => ok),
      retryOnboarding: vi.fn(async () => ok),
      setChecklistItem: vi.fn(async () => ok),
      setChecklistClosed: vi.fn(async () => ok),
    },
  };
}

const deps = fakeDeps();
const declared = Object.values(IPC);

/** Every function the preload exposes, with the path to it (e.g. "api.onboarding.create"). */
function exposedFunctions(node: unknown, prefix = ''): [string, (...args: unknown[]) => unknown][] {
  if (typeof node === 'function') return [[prefix, node as (...args: unknown[]) => unknown]];
  if (typeof node !== 'object' || node === null) return [];
  return Object.entries(node).flatMap(([key, value]) =>
    exposedFunctions(value, prefix ? `${prefix}.${key}` : key),
  );
}

beforeAll(async () => {
  const { registerIpc } = await import('../../../src/main/ipc');
  registerIpc(deps as unknown as Parameters<typeof registerIpc>[0]);
  await import('../../../src/preload/index');
});

describe('IPC contract: shared channels, main handlers and preload', () => {
  it('declares no channel twice', () => {
    expect(new Set(declared).size).toBe(declared.length);
  });

  it.each(Object.entries(IPC))('main registers a handler for %s (%s)', (_key, channel) => {
    expect(electron.handlers.has(channel)).toBe(true);
  });

  it('registers each channel exactly once, and nothing the contract does not declare', () => {
    expect([...electron.registrations].sort()).toEqual([...declared].sort());
  });

  it('exposes the bridge to the renderer as window.accessdesk', () => {
    expect(Object.keys(electron.exposed)).toEqual(['accessdesk']);
  });

  it('has a preload function behind every declared channel, and no other channel', async () => {
    electron.invoked.length = 0;
    const api = electron.exposed['accessdesk'] as AccessDeskApi;

    for (const [, fn] of exposedFunctions(api)) await fn('x', {});

    expect([...new Set(electron.invoked)].sort()).toEqual([...declared].sort());
  });

  it('never gets "No handler registered" from any function the preload exposes', async () => {
    const api = electron.exposed['accessdesk'] as AccessDeskApi;
    const functions = exposedFunctions(api);
    expect(functions.length).toBeGreaterThanOrEqual(declared.length);

    for (const [name, fn] of functions) {
      await expect(Promise.resolve(fn('x', {})), name).resolves.not.toThrow();
    }
  });

  it('names channels only through the shared constants, never as literals (even misspelt ones)', () => {
    // Any 'namespace:name' string using a namespace the contract uses is a channel literal.
    const namespaces = [...new Set(declared.map((channel) => channel.split(':')[0]))];
    const literal = new RegExp(`['"\`](?:${namespaces.join('|')}):[\\w-]+['"\`]`);

    for (const file of ['src/main/ipc.ts', 'src/preload/index.ts']) {
      const source = readFileSync(path.resolve(__dirname, '../../..', file), 'utf8');
      expect(source.match(literal)?.[0], `${file} hard-codes a channel name`).toBeUndefined();
    }
  });
});

describe('IPC contract: what the preload sends is what main reads', () => {
  const api = () => electron.exposed['accessdesk'] as AccessDeskApi;

  it('onboarding.create hands the input straight to the API client', async () => {
    const input = { firstName: 'Ann' };
    await api().api.onboarding.create(input);
    expect(deps.api.createOnboarding).toHaveBeenLastCalledWith(input);
  });

  it('onboarding.retry hands the subject and input to the API client', async () => {
    const input = { departmentGroupId: 'g-eng', role: 'member' };
    await api().api.onboarding.retry('8b1c5f5e', input);
    expect(deps.api.retryOnboarding).toHaveBeenLastCalledWith('8b1c5f5e', input);
  });

  it('checklists.setItem hands the subject, the task and the input to the API client', async () => {
    await api().api.checklists.setItem('subject-1', 'item-1', { done: true });
    expect(deps.api.setChecklistItem).toHaveBeenLastCalledWith('subject-1', 'item-1', {
      done: true,
    });
  });

  it('checklists.setClosed hands the subject and the input to the API client', async () => {
    await api().api.checklists.setClosed('subject-1', { closed: true });
    expect(deps.api.setChecklistClosed).toHaveBeenLastCalledWith('subject-1', { closed: true });
  });

  it('answers 400 to a close call whose payload is not the expected shape', async () => {
    const handler = electron.handlers.get(IPC.apiChecklistClosedSet)!;
    const frame = { url: 'app://accessdesk/index.html' };
    const event = { senderFrame: frame, sender: { mainFrame: frame } };

    expect(await handler(event, { subjectId: 1 })).toEqual({
      ok: false,
      status: 400,
      message: 'Invalid request',
    });
    expect(await handler(event, null)).toMatchObject({ ok: false, status: 400 });
  });

  it('answers 400 to a checklist call whose payload is not the expected shape', async () => {
    const handler = electron.handlers.get(IPC.apiChecklistItemSet)!;
    const frame = { url: 'app://accessdesk/index.html' };
    const event = { senderFrame: frame, sender: { mainFrame: frame } };

    expect(await handler(event, { subjectId: 1 })).toEqual({
      ok: false,
      status: 400,
      message: 'Invalid request',
    });
    expect(await handler(event, 'nope')).toMatchObject({ ok: false, status: 400 });
  });

  it('api.get hands the path and query to the API client', async () => {
    await api().api.get('/employees', { first: 0, max: 20 });
    expect(deps.api.get).toHaveBeenLastCalledWith('/employees', { first: 0, max: 20 });
  });

  it('refuses a call that does not come from the app window', async () => {
    const handler = electron.handlers.get(IPC.apiOnboardingCreate)!;
    const strangerFrame = { url: 'https://evil.example/' };
    const stranger = { senderFrame: strangerFrame, sender: { mainFrame: strangerFrame } };

    expect(() => handler(stranger, {})).toThrow('Untrusted sender');
  });
});
