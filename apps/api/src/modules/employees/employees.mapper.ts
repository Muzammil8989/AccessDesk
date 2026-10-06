import type { Employee } from '@accessdesk/shared';
import type { KeycloakUser } from '@accessdesk/keycloak-client';

/** Keycloak's user representation to the view AccessDesk shows. Nothing is stored. */
export function toEmployee(user: KeycloakUser): Employee {
  return {
    id: user.id,
    username: user.username,
    email: user.email ?? null,
    firstName: user.firstName ?? null,
    lastName: user.lastName ?? null,
    enabled: user.enabled,
    emailVerified: user.emailVerified,
    createdAt: user.createdTimestamp ? new Date(user.createdTimestamp).toISOString() : null,
  };
}
