// Who may use what. The desktop app uses this to HIDE features a user cannot use.
// That is a convenience only: the API checks the real token on every request and is the
// actual gatekeeper. Keep the two in step (the API currently requires any of ADMIN_ROLES).

/** Realm roles allowed to use AccessDesk at all. */
export const ADMIN_ROLES = ['super-admin', 'hr-admin'] as const;

export const FEATURES = [
  'employees',
  'onboard',
  'offboard',
  'access-review',
  'audit-log',
  'settings',
] as const;
export type Feature = (typeof FEATURES)[number];

// Roles that may use each feature (any one is enough). To restrict a feature further, for example
// the audit log to super-admin only, change it here AND make the API enforce the same rule.
export const FEATURE_ROLES: Record<Feature, readonly string[]> = {
  employees: ADMIN_ROLES,
  onboard: ADMIN_ROLES,
  offboard: ADMIN_ROLES,
  'access-review': ADMIN_ROLES,
  'audit-log': ADMIN_ROLES,
  settings: ADMIN_ROLES,
};

export function hasAdminAccess(roles: readonly string[]): boolean {
  return ADMIN_ROLES.some((role) => roles.includes(role));
}

export function canAccess(roles: readonly string[], feature: Feature): boolean {
  return FEATURE_ROLES[feature].some((role) => roles.includes(role));
}
