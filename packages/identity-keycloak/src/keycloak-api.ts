import { IdentityProviderError } from '@accessdesk/identity';
import { z } from 'zod';

const userSchema = z.object({
  id: z.string(),
  username: z.string(),
  email: z.string().nullish(),
  firstName: z.string().nullish(),
  lastName: z.string().nullish(),
  enabled: z.boolean().default(true),
  emailVerified: z.boolean().default(false),
  createdTimestamp: z.number().nullish(),
});
export type RawUser = z.infer<typeof userSchema>;

const groupSchema = z.object({
  id: z.string(),
  name: z.string(),
  path: z.string(),
});
export type RawGroup = z.infer<typeof groupSchema>;

const roleSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullish(),
});
export type RawRole = z.infer<typeof roleSchema>;

export interface ListUsersQuery {
  search?: string;
  first?: number;
  max?: number;
}

export interface NewUser {
  username: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  enabled?: boolean;
}

export interface AdminApiOptions {
  issuerUrl: string;
  getToken: () => string | Promise<string>;
  fetch?: typeof globalThis.fetch;
}

export interface AdminApi {
  listUsers(query: ListUsersQuery): Promise<RawUser[]>;
  countUsers(query: { search?: string }): Promise<number>;
  getUser(subjectId: string): Promise<RawUser>;
  createUser(input: NewUser): Promise<string>;
  disableUser(subjectId: string): Promise<void>;
  endAllSessions(subjectId: string): Promise<void>;
  getUserGroups(subjectId: string): Promise<RawGroup[]>;
  addUserToGroup(subjectId: string, groupId: string): Promise<void>;
  removeUserFromGroup(subjectId: string, groupId: string): Promise<void>;
  getUserRoles(subjectId: string): Promise<RawRole[]>;
  addUserRoles(subjectId: string, roleNames: string[]): Promise<void>;
  removeUserRoles(subjectId: string, roleNames: string[]): Promise<void>;
}

const enc = encodeURIComponent;

export function parseIssuerUrl(issuerUrl: string): { baseUrl: string; realm: string } {
  const example = 'for example https://sso.example.com/realms/company';
  let url: URL;
  try {
    url = new URL(issuerUrl);
  } catch {
    throw new Error(`The issuer URL is not a valid URL (${example})`);
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error(`The issuer URL must start with http:// or https:// (${example})`);
  }
  const match = /^(.*)\/realms\/([^/]+)\/*$/.exec(url.pathname);
  if (!match || url.search || url.hash) {
    throw new Error(`The issuer URL must end in /realms/<realm> (${example})`);
  }
  let realm: string;
  try {
    realm = decodeURIComponent(match[2]!);
  } catch {
    throw new Error(`The realm in the issuer URL is not valid (${example})`);
  }
  return { baseUrl: `${url.origin}${match[1]}`, realm };
}

export function createAdminApi(options: AdminApiOptions): AdminApi {
  const doFetch = options.fetch ?? globalThis.fetch;
  const { baseUrl, realm } = parseIssuerUrl(options.issuerUrl);
  const adminBase = `${baseUrl}/admin/realms/${enc(realm)}`;

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

  async function resolveRoles(names: string[]): Promise<RawRole[]> {
    return Promise.all(
      names.map(async (name) => json(await request('GET', `/roles/${enc(name)}`), roleSchema)),
    );
  }

  return {
    async listUsers(query) {
      const res = await request('GET', '/users', {
        query: { search: query.search, first: query.first, max: query.max },
      });
      return json(res, z.array(userSchema));
    },

    async countUsers(query) {
      const res = await request('GET', '/users/count', { query: { search: query.search } });
      return json(res, z.number());
    },

    async getUser(subjectId) {
      return json(await request('GET', `/users/${enc(subjectId)}`), userSchema);
    },

    async createUser(input) {
      const res = await request('POST', '/users', { body: { enabled: true, ...input } });
      const subjectId = res.headers.get('Location')?.split('/').pop();
      if (!subjectId) {
        throw new IdentityProviderError(
          502,
          'The identity provider did not say where the new user is',
        );
      }
      return subjectId;
    },

    async disableUser(subjectId) {
      await request('PUT', `/users/${enc(subjectId)}`, { body: { enabled: false } });
    },

    async endAllSessions(subjectId) {
      await request('POST', `/users/${enc(subjectId)}/logout`);
    },

    async getUserGroups(subjectId) {
      const res = await request('GET', `/users/${enc(subjectId)}/groups`);
      return json(res, z.array(groupSchema));
    },

    async addUserToGroup(subjectId, groupId) {
      await request('PUT', `/users/${enc(subjectId)}/groups/${enc(groupId)}`);
    },

    async removeUserFromGroup(subjectId, groupId) {
      await request('DELETE', `/users/${enc(subjectId)}/groups/${enc(groupId)}`);
    },

    async getUserRoles(subjectId) {
      const res = await request('GET', `/users/${enc(subjectId)}/role-mappings/realm`);
      return json(res, z.array(roleSchema));
    },

    async addUserRoles(subjectId, roleNames) {
      const roles = await resolveRoles(roleNames);
      await request('POST', `/users/${enc(subjectId)}/role-mappings/realm`, { body: roles });
    },

    async removeUserRoles(subjectId, roleNames) {
      const roles = await resolveRoles(roleNames);
      await request('DELETE', `/users/${enc(subjectId)}/role-mappings/realm`, { body: roles });
    },
  };
}

async function toError(res: Response): Promise<IdentityProviderError> {
  let detail = res.statusText;
  try {
    const body = (await res.json()) as { errorMessage?: string; error?: string };
    detail = body.errorMessage ?? body.error ?? detail;
  } catch {}
  return new IdentityProviderError(
    res.status,
    `Identity provider request failed (${res.status}): ${detail}`,
  );
}
