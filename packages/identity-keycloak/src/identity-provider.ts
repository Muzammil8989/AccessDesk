import type {
  IdentityGroup,
  IdentityProvider,
  IdentityRole,
  IdentityUser,
} from '@accessdesk/identity';
import {
  createAdminApi,
  parseIssuerUrl,
  type AdminApiOptions,
  type RawGroup,
  type RawRole,
  type RawUser,
} from './keycloak-api';

export type IdentityProviderOptions = AdminApiOptions;

const DEFAULT_PAGE_SIZE = 100;

// Roles the realm creates for itself. The default composite role carries the realm's name.
const BUILTIN_ROLE_NAMES = new Set(['offline_access', 'uma_authorization']);

function isBuiltinRole(name: string, realm: string): boolean {
  const lower = name.toLowerCase();
  return BUILTIN_ROLE_NAMES.has(lower) || lower === `default-roles-${realm.toLowerCase()}`;
}

// The members endpoints cannot search, so this mirrors the user search's default: a
// case-insensitive prefix match on username, email, first name or last name. The same text
// then finds the same people with and without a group or role filter.
function matchesSearch(user: RawUser, search: string | undefined): boolean {
  if (!search) return true;
  const needle = search.toLowerCase();
  return [user.username, user.email, user.firstName, user.lastName].some((field) =>
    field?.toLowerCase().startsWith(needle),
  );
}

function mapUser(user: RawUser): IdentityUser {
  return {
    subjectId: user.id,
    username: user.username,
    email: user.email ?? null,
    firstName: user.firstName ?? null,
    lastName: user.lastName ?? null,
    enabled: user.enabled,
    emailVerified: user.emailVerified,
    createdAt: user.createdTimestamp ? new Date(user.createdTimestamp) : null,
  };
}

const mapGroup = (group: RawGroup): IdentityGroup => ({
  id: group.id,
  name: group.name,
  path: group.path,
});

export function createKeycloakIdentityProvider(options: IdentityProviderOptions): IdentityProvider {
  const api = createAdminApi(options);
  const { realm } = parseIssuerUrl(options.issuerUrl);

  const mapRole = (role: RawRole): IdentityRole => ({
    name: role.name,
    description: role.description ?? null,
    builtin: isBuiltinRole(role.name, realm),
  });

  return {
    async listUsersPage({
      search,
      enabled,
      groupId,
      role,
      first = 0,
      max = DEFAULT_PAGE_SIZE,
    } = {}) {
      const members =
        groupId !== undefined
          ? api.listGroupMembers(groupId)
          : role !== undefined
            ? api.listRoleHolders(role)
            : undefined;
      if (members) {
        const { users, capped } = await members;
        const matching = users
          .filter(
            (user) =>
              matchesSearch(user, search) && (enabled === undefined || user.enabled === enabled),
          )
          .sort((a, b) => a.username.localeCompare(b.username));
        return {
          users: matching.slice(first, first + max).map(mapUser),
          total: matching.length,
          capped,
        };
      }
      const [users, total] = await Promise.all([
        api.listUsers({ search, enabled, first, max }),
        api.countUsers({ search, enabled }),
      ]);
      return { users: users.map(mapUser), total, capped: false };
    },
    async findUsers({ username, email }) {
      return (await api.findUsersExact({ username, email })).map(mapUser);
    },
    async getUser(subjectId) {
      return mapUser(await api.getUser(subjectId));
    },
    createUser: (input) => api.createUser(input),
    disableUser: (subjectId) => api.disableUser(subjectId),
    endAllSessions: (subjectId) => api.endAllSessions(subjectId),
    async listGroups() {
      return (await api.listGroups()).map(mapGroup);
    },
    async getUserGroups(subjectId) {
      return (await api.getUserGroups(subjectId)).map(mapGroup);
    },
    addUserToGroup: (subjectId, groupId) => api.addUserToGroup(subjectId, groupId),
    removeUserFromGroup: (subjectId, groupId) => api.removeUserFromGroup(subjectId, groupId),
    async listRoles() {
      return (await api.listRoles()).map(mapRole);
    },
    async getUserRoles(subjectId) {
      return (await api.getUserRoles(subjectId)).map(mapRole);
    },
    addUserRoles: (subjectId, roleNames) => api.addUserRoles(subjectId, roleNames),
    removeUserRoles: (subjectId, roleNames) => api.removeUserRoles(subjectId, roleNames),
  };
}
