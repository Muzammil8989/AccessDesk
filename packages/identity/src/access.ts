import { z } from 'zod';

export const DEFAULT_ADMIN_ROLES = ['super-admin', 'hr-admin'] as const;

export const DEFAULT_SUPER_ADMIN_ROLE = 'super-admin';

export const DEFAULT_ROLES_CLAIM_PATH = 'realm_access.roles';

export const superAdminRoleSchema = z
  .string()
  .default(DEFAULT_SUPER_ADMIN_ROLE)
  .pipe(z.string().trim().min(1));

export const adminRolesSchema = z
  .string()
  .default(DEFAULT_ADMIN_ROLES.join(','))
  .transform((value) => value.split(',').map((role) => role.trim()))
  .pipe(z.array(z.string().min(1)).min(1));

export const rolesClaimPathSchema = z
  .string()
  .default(DEFAULT_ROLES_CLAIM_PATH)
  .refine((value) => value.split('.').every((segment) => segment.length > 0));

export const accessPolicyEnvSchema = z.object({
  AUTH_ADMIN_ROLES: adminRolesSchema,
  AUTH_SUPER_ADMIN_ROLE: superAdminRoleSchema,
  AUTH_ROLES_CLAIM_PATH: rolesClaimPathSchema,
});

export interface AccessPolicy {
  adminRoles: string[];
  superAdminRole: string;
  rolesClaimPath: string;
}

export function loadAccessPolicy(env: Record<string, string | undefined>): AccessPolicy {
  const parsed = accessPolicyEnvSchema.safeParse(env);
  if (!parsed.success) {
    const names = [...new Set(parsed.error.issues.map((issue) => String(issue.path[0])))].join(
      ', ',
    );
    throw new Error(`Invalid access configuration: ${names}`);
  }
  return {
    adminRoles: parsed.data.AUTH_ADMIN_ROLES,
    superAdminRole: parsed.data.AUTH_SUPER_ADMIN_ROLE,
    rolesClaimPath: parsed.data.AUTH_ROLES_CLAIM_PATH,
  };
}

const roleNamesSchema = z.array(z.string());

export function readRolesFromClaims(claims: object, path: string): string[] {
  let node: unknown = claims;
  for (const segment of path.split('.')) {
    if (node === undefined) return [];
    if (typeof node !== 'object' || node === null || Array.isArray(node)) {
      throw new Error('The roles claim path runs through a value that is not an object');
    }
    node = Object.hasOwn(node, segment) ? (node as Record<string, unknown>)[segment] : undefined;
  }
  return node === undefined ? [] : roleNamesSchema.parse(node);
}
