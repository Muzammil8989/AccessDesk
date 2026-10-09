export const OWNER_ROLE = 'owner';
export const ADMIN_ROLE = 'admin';

export interface RolePolicy {
  adminRoles: readonly string[];
  superAdminRole: string;
}

const sameRole = (a: string, b: string): boolean => a.toLowerCase() === b.toLowerCase();

export const ADMIN_ROLE_REASON = `Only a super-admin can assign the ${ADMIN_ROLE} role`;

/**
 * The one rule for which roles onboarding may assign, whether the role comes from the form or from a
 * template (ADR 0011). Returns the reason a role is refused, or null when the caller may assign it.
 * Names are compared without regard to case.
 */
export function roleViolation(
  role: string,
  callerRoles: readonly string[],
  policy: RolePolicy,
): string | null {
  if (sameRole(role, OWNER_ROLE)) {
    return `The ${OWNER_ROLE} role cannot be assigned through onboarding`;
  }
  if (sameRole(role, policy.superAdminRole)) {
    return `The ${policy.superAdminRole} role cannot be assigned through onboarding. Give it in the identity provider`;
  }
  const privileged =
    sameRole(role, ADMIN_ROLE) || policy.adminRoles.some((adminRole) => sameRole(adminRole, role));
  if (privileged && !callerRoles.includes(policy.superAdminRole)) {
    return `Only a super-admin can assign the ${role} role`;
  }
  return null;
}
