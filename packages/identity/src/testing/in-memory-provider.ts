import { randomUUID } from 'node:crypto';
import {
  IdentityProviderError,
  type CountUsersParams,
  type CreateUserInput,
  type FindUsersParams,
  type IdentityGroup,
  type IdentityProvider,
  type IdentityRole,
  type IdentityUser,
  type InitialPassword,
  type ListUsersParams,
} from '../identity';

const DEFAULT_PAGE_SIZE = 100;
const CLOCK_START_MS = 1_700_000_000_000;
const CLOCK_STEP_MS = 1_000;

export type InMemoryProviderMethod = keyof IdentityProvider;

export interface InMemoryUserState {
  groupIds: string[];
  roleNames: string[];
  initialPassword: InitialPassword | null;
}

export interface InMemoryIdentityProvider {
  provider: IdentityProvider;
  seedGroup(name: string): string;
  seedRole(name: string): void;
  failNext(method: InMemoryProviderMethod, error: Error, times?: number): void;
  clearFailures(): void;
  inspect(subjectId: string): InMemoryUserState | undefined;
  callCount(method: InMemoryProviderMethod): number;
}

interface StoredUser {
  user: IdentityUser;
  groupIds: Set<string>;
  roleNames: Set<string>;
  initialPassword: InitialPassword | null;
}

interface ArmedFailure {
  error: Error;
  remaining: number;
}

function sameText(a: string | null | undefined, b: string | null | undefined): boolean {
  return a !== null && a !== undefined && b !== null && b !== undefined
    ? a.toLowerCase() === b.toLowerCase()
    : false;
}

function matchesSearch(user: IdentityUser, search: string | undefined): boolean {
  if (!search) return true;
  const needle = search.toLowerCase();
  return [user.username, user.email, user.firstName, user.lastName].some(
    (field) => field !== null && field.toLowerCase().includes(needle),
  );
}

export function createInMemoryIdentityProvider(): InMemoryIdentityProvider {
  const users = new Map<string, StoredUser>();
  const groups = new Map<string, IdentityGroup>();
  const roles = new Map<string, IdentityRole>();
  const failures = new Map<InMemoryProviderMethod, ArmedFailure>();
  const calls = new Map<InMemoryProviderMethod, number>();
  let clockMs = CLOCK_START_MS;

  function take(method: InMemoryProviderMethod): void {
    calls.set(method, (calls.get(method) ?? 0) + 1);
    const armed = failures.get(method);
    if (!armed) return;
    armed.remaining -= 1;
    if (armed.remaining <= 0) failures.delete(method);
    throw armed.error;
  }

  function stored(subjectId: string): StoredUser {
    const found = users.get(subjectId);
    if (!found) throw new IdentityProviderError(404, 'User not found');
    return found;
  }

  function sorted(search: string | undefined): IdentityUser[] {
    return [...users.values()]
      .map((entry) => entry.user)
      .filter((user) => matchesSearch(user, search))
      .sort((a, b) => a.username.localeCompare(b.username));
  }

  const provider: IdentityProvider = {
    async listUsers(params: ListUsersParams = {}) {
      take('listUsers');
      const first = params.first ?? 0;
      return sorted(params.search).slice(first, first + (params.max ?? DEFAULT_PAGE_SIZE));
    },

    async countUsers(params: CountUsersParams = {}) {
      take('countUsers');
      return sorted(params.search).length;
    },

    async findUsers(params: FindUsersParams) {
      take('findUsers');
      return [...users.values()]
        .map((entry) => entry.user)
        .filter(
          (user) =>
            (params.username === undefined || sameText(user.username, params.username)) &&
            (params.email === undefined || sameText(user.email, params.email)),
        );
    },

    async getUser(subjectId: string) {
      take('getUser');
      return { ...stored(subjectId).user };
    },

    async createUser(input: CreateUserInput) {
      take('createUser');
      const existing = [...users.values()].map((entry) => entry.user);
      if (existing.some((user) => sameText(user.username, input.username))) {
        throw new IdentityProviderError(409, 'User exists with same username');
      }
      if (input.email !== undefined && existing.some((user) => sameText(user.email, input.email))) {
        throw new IdentityProviderError(409, 'User exists with same email');
      }
      const subjectId = randomUUID();
      clockMs += CLOCK_STEP_MS;
      users.set(subjectId, {
        user: {
          subjectId,
          username: input.username.toLowerCase(),
          email: input.email?.toLowerCase() ?? null,
          firstName: input.firstName ?? null,
          lastName: input.lastName ?? null,
          enabled: input.enabled ?? true,
          emailVerified: input.emailVerified ?? false,
          createdAt: new Date(clockMs),
        },
        groupIds: new Set(),
        roleNames: new Set(),
        initialPassword: input.initialPassword ? { ...input.initialPassword } : null,
      });
      return subjectId;
    },

    async disableUser(subjectId: string) {
      take('disableUser');
      const entry = stored(subjectId);
      entry.user = { ...entry.user, enabled: false };
    },

    async endAllSessions(subjectId: string) {
      take('endAllSessions');
      stored(subjectId);
    },

    async listGroups() {
      take('listGroups');
      return [...groups.values()].map((group) => ({ ...group }));
    },

    async getUserGroups(subjectId: string) {
      take('getUserGroups');
      const entry = stored(subjectId);
      return [...entry.groupIds].flatMap((id) => {
        const group = groups.get(id);
        return group ? [{ ...group }] : [];
      });
    },

    async addUserToGroup(subjectId: string, groupId: string) {
      take('addUserToGroup');
      const entry = stored(subjectId);
      if (!groups.has(groupId)) throw new IdentityProviderError(404, 'Group not found');
      entry.groupIds.add(groupId);
    },

    async removeUserFromGroup(subjectId: string, groupId: string) {
      take('removeUserFromGroup');
      stored(subjectId).groupIds.delete(groupId);
    },

    async getUserRoles(subjectId: string) {
      take('getUserRoles');
      const entry = stored(subjectId);
      return [...entry.roleNames].flatMap((name) => {
        const role = roles.get(name);
        return role ? [{ ...role }] : [];
      });
    },

    async addUserRoles(subjectId: string, roleNames: string[]) {
      take('addUserRoles');
      const entry = stored(subjectId);
      for (const name of roleNames) {
        if (!roles.has(name)) throw new IdentityProviderError(404, 'Role not found');
      }
      for (const name of roleNames) entry.roleNames.add(name);
    },

    async removeUserRoles(subjectId: string, roleNames: string[]) {
      take('removeUserRoles');
      const entry = stored(subjectId);
      for (const name of roleNames) {
        if (!roles.has(name)) throw new IdentityProviderError(404, 'Role not found');
      }
      for (const name of roleNames) entry.roleNames.delete(name);
    },
  };

  return {
    provider,
    seedGroup(name) {
      const id = randomUUID();
      groups.set(id, { id, name, path: `/${name}` });
      return id;
    },
    seedRole(name) {
      roles.set(name, { name, description: null });
    },
    failNext(method, error, times = 1) {
      failures.set(method, { error, remaining: times });
    },
    clearFailures() {
      failures.clear();
    },
    inspect(subjectId) {
      const entry = users.get(subjectId);
      if (!entry) return undefined;
      return {
        groupIds: [...entry.groupIds],
        roleNames: [...entry.roleNames],
        initialPassword: entry.initialPassword ? { ...entry.initialPassword } : null,
      };
    },
    callCount(method) {
      return calls.get(method) ?? 0;
    },
  };
}
