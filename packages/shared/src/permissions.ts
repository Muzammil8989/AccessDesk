export const FEATURES = [
  'employees',
  'onboard',
  'offboard',
  'access-review',
  'audit-log',
  'settings',
] as const;
export type Feature = (typeof FEATURES)[number];

export type FeatureAccess = 'admin';

export const FEATURE_ACCESS: Record<Feature, FeatureAccess> = {
  employees: 'admin',
  onboard: 'admin',
  offboard: 'admin',
  'access-review': 'admin',
  'audit-log': 'admin',
  settings: 'admin',
};

export function hasAdminAccess(roles: readonly string[], adminRoles: readonly string[]): boolean {
  return adminRoles.some((role) => roles.includes(role));
}

export function canAccess(
  roles: readonly string[],
  feature: Feature,
  adminRoles: readonly string[],
): boolean {
  switch (FEATURE_ACCESS[feature]) {
    case 'admin':
      return hasAdminAccess(roles, adminRoles);
  }
}
