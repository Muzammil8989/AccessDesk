import { z } from 'zod';

// Only the fields AccessDesk uses. Keycloak returns more; unknown keys are dropped.
export const keycloakUserSchema = z.object({
  id: z.string(),
  username: z.string(),
  email: z.string().nullish(),
  firstName: z.string().nullish(),
  lastName: z.string().nullish(),
  enabled: z.boolean().default(true),
  emailVerified: z.boolean().default(false),
  createdTimestamp: z.number().nullish(),
});
export type KeycloakUser = z.infer<typeof keycloakUserSchema>;

export const keycloakGroupSchema = z.object({
  id: z.string(),
  name: z.string(),
  path: z.string(),
});
export type KeycloakGroup = z.infer<typeof keycloakGroupSchema>;

export const keycloakRoleSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullish(),
});
export type KeycloakRole = z.infer<typeof keycloakRoleSchema>;

export interface ListUsersParams {
  search?: string;
  first?: number;
  max?: number;
}

export interface CreateUserInput {
  username: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  enabled?: boolean;
}

// The one interface the rest of the codebase uses to reach Keycloak.
export interface KeycloakClient {
  listUsers(params?: ListUsersParams): Promise<KeycloakUser[]>;
  countUsers(params?: { search?: string }): Promise<number>;
  getUser(userId: string): Promise<KeycloakUser>;
  /** Returns the new user's ID. */
  createUser(input: CreateUserInput): Promise<string>;
  disableUser(userId: string): Promise<void>;
  logoutAllSessions(userId: string): Promise<void>;

  getUserGroups(userId: string): Promise<KeycloakGroup[]>;
  addUserToGroup(userId: string, groupId: string): Promise<void>;
  removeUserFromGroup(userId: string, groupId: string): Promise<void>;

  getUserRealmRoles(userId: string): Promise<KeycloakRole[]>;
  addUserRealmRoles(userId: string, roleNames: string[]): Promise<void>;
  removeUserRealmRoles(userId: string, roleNames: string[]): Promise<void>;
}
