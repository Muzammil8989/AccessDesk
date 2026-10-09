import type {
  IdentityGroup,
  IdentityProvider,
  IdentityRole,
  IdentityUser,
} from '@accessdesk/identity';
import {
  createAdminApi,
  type AdminApiOptions,
  type RawGroup,
  type RawRole,
  type RawUser,
} from './keycloak-api';

export type IdentityProviderOptions = AdminApiOptions;

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

const mapRole = (role: RawRole): IdentityRole => ({
  name: role.name,
  description: role.description ?? null,
});

export function createKeycloakIdentityProvider(options: IdentityProviderOptions): IdentityProvider {
  const api = createAdminApi(options);

  return {
    async listUsers(params = {}) {
      return (await api.listUsers(params)).map(mapUser);
    },
    countUsers: (params = {}) => api.countUsers(params),
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
