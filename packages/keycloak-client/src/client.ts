import { z } from 'zod';
import {
  keycloakGroupSchema,
  keycloakRoleSchema,
  keycloakUserSchema,
  type KeycloakClient,
} from './types';

export class KeycloakError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'KeycloakError';
  }
}

export interface KeycloakClientOptions {
  baseUrl: string;
  realm: string;
  /** Called for every request. Pass the logged-in admin's own access token. */
  getToken: () => string | Promise<string>;
  /** Injectable for tests. */
  fetch?: typeof globalThis.fetch;
}

const enc = encodeURIComponent;

export function createKeycloakClient(options: KeycloakClientOptions): KeycloakClient {
  const doFetch = options.fetch ?? globalThis.fetch;
  const adminBase = `${options.baseUrl.replace(/\/+$/, '')}/admin/realms/${enc(options.realm)}`;

  async function request(
    method: string,
    path: string,
    opts: { query?: Record<string, string | number | undefined>; body?: unknown } = {},
  ): Promise<Response> {
    const url = new URL(`${adminBase}${path}`);
    for (const [key, value] of Object.entries(opts.query ?? {})) {
      if (value !== undefined && value !== '') url.searchParams.set(key, String(value));
    }
    const headers: Record<string, string> = {
      Authorization: `Bearer ${await options.getToken()}`,
      Accept: 'application/json',
    };
    if (opts.body !== undefined) headers['Content-Type'] = 'application/json';

    const res = await doFetch(url, {
      method,
      headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    });
    if (!res.ok) throw await toError(res);
    return res;
  }

  async function json<T extends z.ZodType>(res: Response, schema: T): Promise<z.infer<T>> {
    return schema.parse(await res.json());
  }

  // Resolve role names to Keycloak role representations (role-mapping calls need id + name).
  async function resolveRoles(names: string[]) {
    return Promise.all(
      names.map(async (name) =>
        json(await request('GET', `/roles/${enc(name)}`), keycloakRoleSchema),
      ),
    );
  }

  return {
    async listUsers(params = {}) {
      const res = await request('GET', '/users', {
        query: { search: params.search, first: params.first, max: params.max },
      });
      return json(res, z.array(keycloakUserSchema));
    },

    async countUsers(params = {}) {
      const res = await request('GET', '/users/count', { query: { search: params.search } });
      return json(res, z.number());
    },

    async getUser(userId) {
      return json(await request('GET', `/users/${enc(userId)}`), keycloakUserSchema);
    },

    async createUser(input) {
      const res = await request('POST', '/users', {
        body: { enabled: true, ...input },
      });
      // Keycloak answers 201 with the new user's URL in the Location header.
      const id = res.headers.get('Location')?.split('/').pop();
      if (!id) throw new KeycloakError(502, 'Keycloak did not return the new user location');
      return id;
    },

    async disableUser(userId) {
      await request('PUT', `/users/${enc(userId)}`, { body: { enabled: false } });
    },

    async logoutAllSessions(userId) {
      await request('POST', `/users/${enc(userId)}/logout`);
    },

    async getUserGroups(userId) {
      const res = await request('GET', `/users/${enc(userId)}/groups`);
      return json(res, z.array(keycloakGroupSchema));
    },

    async addUserToGroup(userId, groupId) {
      await request('PUT', `/users/${enc(userId)}/groups/${enc(groupId)}`);
    },

    async removeUserFromGroup(userId, groupId) {
      await request('DELETE', `/users/${enc(userId)}/groups/${enc(groupId)}`);
    },

    async getUserRealmRoles(userId) {
      const res = await request('GET', `/users/${enc(userId)}/role-mappings/realm`);
      return json(res, z.array(keycloakRoleSchema));
    },

    async addUserRealmRoles(userId, roleNames) {
      const roles = await resolveRoles(roleNames);
      await request('POST', `/users/${enc(userId)}/role-mappings/realm`, { body: roles });
    },

    async removeUserRealmRoles(userId, roleNames) {
      const roles = await resolveRoles(roleNames);
      await request('DELETE', `/users/${enc(userId)}/role-mappings/realm`, { body: roles });
    },
  };
}

async function toError(res: Response): Promise<KeycloakError> {
  let detail = res.statusText;
  try {
    const body = (await res.json()) as { errorMessage?: string; error?: string };
    detail = body.errorMessage ?? body.error ?? detail;
  } catch {
    // Non-JSON error body: keep the status text.
  }
  return new KeycloakError(res.status, `Keycloak request failed (${res.status}): ${detail}`);
}
