import { randomUUID } from 'node:crypto';

interface StoredUser {
  id: string;
  username: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  enabled: boolean;
  emailVerified: boolean;
  createdTimestamp: number;
  groupIds: Set<string>;
  roleNames: Set<string>;
  credentials?: unknown;
}

interface StoredGroup {
  id: string;
  name: string;
  path: string;
}

interface StoredRole {
  id: string;
  name: string;
}

const REALM = 'company-platform';
const ORIGIN = 'http://idp.test';
export const FAKE_ISSUER_URL = `${ORIGIN}/realms/${REALM}`;

export function createFakeAdminServer() {
  const users = new Map<string, StoredUser>();
  const groups = new Map<string, StoredGroup>();
  const roles = new Map<string, StoredRole>();
  let clock = 1_700_000_000_000;

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  const empty = (status = 204, headers: Record<string, string> = {}) =>
    new Response(null, { status, headers });
  const notFound = (what: string) => json({ errorMessage: `${what} not found` }, 404);

  const representation = ({ groupIds: _g, roleNames: _r, credentials: _c, ...user }: StoredUser) =>
    user;

  const matches = (user: StoredUser, search: string | null) => {
    if (!search) return true;
    const needle = search.toLowerCase();
    return [user.username, user.email, user.firstName, user.lastName].some((field) =>
      field?.toLowerCase().includes(needle),
    );
  };

  const matchesField = (value: string | undefined, wanted: string | null, exact: boolean) => {
    if (wanted === null) return true;
    if (value === undefined) return false;
    return exact
      ? value.toLowerCase() === wanted.toLowerCase()
      : value.toLowerCase().includes(wanted.toLowerCase());
  };

  const fetchImpl: typeof fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const method = init?.method ?? 'GET';
    const headers = (init?.headers ?? {}) as Record<string, string>;
    const body: unknown = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;

    const prefix = `/admin/realms/${REALM}`;
    if (!url.pathname.startsWith(prefix)) return notFound('Realm');
    if (!headers.Authorization?.startsWith('Bearer ')) {
      return json({ error: 'HTTP 401 Unauthorized' }, 401);
    }
    const path = url.pathname
      .slice(prefix.length)
      .split('/')
      .filter(Boolean)
      .map(decodeURIComponent);
    const [collection, id, sub, subId] = path;

    if (collection === 'roles' && id && !sub && method === 'GET') {
      const role = roles.get(id);
      return role ? json(role) : notFound('Role');
    }

    if (collection === 'groups' && !id && method === 'GET') {
      const first = Number(url.searchParams.get('first') ?? 0);
      const max = Number(url.searchParams.get('max') ?? 100);
      return json([...groups.values()].slice(first, first + max));
    }

    if (collection !== 'users') return notFound('Resource');

    if (!id) {
      if (method === 'GET') {
        const exact = url.searchParams.get('exact') === 'true';
        const found = [...users.values()]
          .filter((u) => matches(u, url.searchParams.get('search')))
          .filter((u) => matchesField(u.username, url.searchParams.get('username'), exact))
          .filter((u) => matchesField(u.email, url.searchParams.get('email'), exact))
          .sort((a, b) => a.username.localeCompare(b.username));
        const first = Number(url.searchParams.get('first') ?? 0);
        const max = Number(url.searchParams.get('max') ?? 100);
        return json(found.slice(first, first + max).map(representation));
      }
      if (method === 'POST') {
        const input = body as Partial<StoredUser> & { username: string };
        const existing = [...users.values()];
        if (existing.some((u) => matchesField(u.username, input.username, true))) {
          return json({ errorMessage: 'User exists with same username' }, 409);
        }
        if (
          input.email !== undefined &&
          existing.some((u) => matchesField(u.email, input.email!, true))
        ) {
          return json({ errorMessage: 'User exists with same email' }, 409);
        }
        const user: StoredUser = {
          emailVerified: false,
          enabled: true,
          ...input,
          id: randomUUID(),
          createdTimestamp: (clock += 1000),
          groupIds: new Set(),
          roleNames: new Set(),
        };
        users.set(user.id, user);
        return empty(201, { Location: `${ORIGIN}${prefix}/users/${user.id}` });
      }
    }

    if (id === 'count' && method === 'GET') {
      return json(
        [...users.values()].filter((u) => matches(u, url.searchParams.get('search'))).length,
      );
    }

    const user = id ? users.get(id) : undefined;
    if (!id || !user) return notFound('User');

    if (!sub) {
      if (method === 'GET') return json(representation(user));
      if (method === 'PUT') {
        Object.assign(user, body);
        return empty();
      }
    }
    if (sub === 'logout' && method === 'POST') return empty();

    if (sub === 'groups') {
      if (!subId && method === 'GET') {
        return json([...user.groupIds].map((gid) => groups.get(gid)));
      }
      if (subId && method === 'PUT') {
        if (!groups.has(subId)) return notFound('Group');
        user.groupIds.add(subId);
        return empty();
      }
      if (subId && method === 'DELETE') {
        user.groupIds.delete(subId);
        return empty();
      }
    }

    if (sub === 'role-mappings' && subId === 'realm') {
      if (method === 'GET') return json([...user.roleNames].map((name) => roles.get(name)));
      const names = (body as StoredRole[]).map((role) => role.name);
      if (method === 'POST') names.forEach((name) => user.roleNames.add(name));
      if (method === 'DELETE') names.forEach((name) => user.roleNames.delete(name));
      return empty();
    }

    return notFound('Resource');
  };

  return {
    fetch: fetchImpl,
    seedGroup(name: string): string {
      const group = { id: randomUUID(), name, path: `/${name}` };
      groups.set(group.id, group);
      return group.id;
    },
    seedRole(name: string): void {
      roles.set(name, { id: randomUUID(), name });
    },
  };
}
