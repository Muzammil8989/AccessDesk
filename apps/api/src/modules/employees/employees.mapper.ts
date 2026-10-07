import type { IdentityUser } from '@accessdesk/identity';
import type { Employee } from '@accessdesk/shared';

export function toEmployee(user: IdentityUser): Employee {
  return {
    id: user.subjectId,
    username: user.username,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    enabled: user.enabled,
    emailVerified: user.emailVerified,
    createdAt: user.createdAt?.toISOString() ?? null,
  };
}
