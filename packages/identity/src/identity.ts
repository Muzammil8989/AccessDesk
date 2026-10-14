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
  // True for roles the identity provider creates itself, so a screen can hide them by default.
  builtin: boolean;
}

// groupId and role are alternatives. They list direct members only, and the provider has to
// read every member to count them, so those lists stop at memberFilterCap.
export interface ListUsersParams {
  search?: string;
  enabled?: boolean;
  groupId?: string;
  role?: string;
  first?: number;
  max?: number;
}

export interface UserPage {
  users: IdentityUser[];
  total: number;
  // True when a group or role list reached the cap: total and users are then incomplete.
  capped: boolean;
}

export const DEFAULT_MEMBER_FILTER_CAP = 2000;

export interface FindUsersParams {
  username?: string;
  email?: string;
  exact: true;
}

export interface InitialPassword {
  value: string;
  temporary: boolean;
}

export interface CreateUserInput {
  username: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  enabled?: boolean;
  emailVerified?: boolean;
  initialPassword?: InitialPassword;
}

export interface IdentityProvider {
  listUsersPage(params?: ListUsersParams): Promise<UserPage>;
  findUsers(params: FindUsersParams): Promise<IdentityUser[]>;
  getUser(subjectId: string): Promise<IdentityUser>;
  createUser(input: CreateUserInput): Promise<string>;
  disableUser(subjectId: string): Promise<void>;
  endAllSessions(subjectId: string): Promise<void>;

  listGroups(): Promise<IdentityGroup[]>;
  getUserGroups(subjectId: string): Promise<IdentityGroup[]>;
  addUserToGroup(subjectId: string, groupId: string): Promise<void>;
  removeUserFromGroup(subjectId: string, groupId: string): Promise<void>;

  listRoles(): Promise<IdentityRole[]>;
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
