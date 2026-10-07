export interface IdentityUser {
  subjectId: string;
  username: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  enabled: boolean;
  emailVerified: boolean;
  createdAt: Date | null;
}

export interface IdentityGroup {
  id: string;
  name: string;
  path: string;
}

export interface IdentityRole {
  name: string;
  description: string | null;
}

export interface ListUsersParams {
  search?: string;
  first?: number;
  max?: number;
}

export interface CountUsersParams {
  search?: string;
}

export interface CreateUserInput {
  username: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  enabled?: boolean;
}

export interface IdentityProvider {
  listUsers(params?: ListUsersParams): Promise<IdentityUser[]>;
  countUsers(params?: CountUsersParams): Promise<number>;
  getUser(subjectId: string): Promise<IdentityUser>;
  createUser(input: CreateUserInput): Promise<string>;
  disableUser(subjectId: string): Promise<void>;
  endAllSessions(subjectId: string): Promise<void>;

  getUserGroups(subjectId: string): Promise<IdentityGroup[]>;
  addUserToGroup(subjectId: string, groupId: string): Promise<void>;
  removeUserFromGroup(subjectId: string, groupId: string): Promise<void>;

  getUserRoles(subjectId: string): Promise<IdentityRole[]>;
  addUserRoles(subjectId: string, roleNames: string[]): Promise<void>;
  removeUserRoles(subjectId: string, roleNames: string[]): Promise<void>;
}

export class IdentityProviderError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'IdentityProviderError';
  }
}
