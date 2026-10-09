import { z } from 'zod';
import { ADMIN_ROLE_REASON, roleViolation, type RolePolicy } from './role-policy';

export const ONBOARDABLE_ROLES = ['member', 'manager', 'admin'] as const;
export type OnboardableRole = (typeof ONBOARDABLE_ROLES)[number];

export const ONBOARDING_STEP_NAMES = [
  'create_user',
  'add_to_group',
  'assign_role',
  'template_add_to_group',
  'template_assign_role',
  'create_checklist',
] as const;
export type OnboardingStepName = (typeof ONBOARDING_STEP_NAMES)[number];

export const ONBOARDING_ERROR_CODES = {
  usernameExists: 'username_exists',
  emailExists: 'email_exists',
  unknownManager: 'unknown_manager',
  managerDisabled: 'manager_disabled',
} as const;

export const NAME_MAX_LENGTH = 80;
const USERNAME_PATTERN = /^[a-z0-9._-]{3,64}$/;
const NO_CONTROL_CHARACTERS = /^[^\p{Cc}]*$/u;

const personNameSchema = (label: string) =>
  z
    .string()
    .trim()
    .min(1, `Enter a ${label}`)
    .max(NAME_MAX_LENGTH, `Use ${NAME_MAX_LENGTH} characters or fewer`)
    .regex(NO_CONTROL_CHARACTERS, 'Remove special control characters');

const roleSchema = z.enum(ONBOARDABLE_ROLES, 'Choose a role');

export const onboardEmployeeSchema = z.object({
  firstName: personNameSchema('first name'),
  lastName: personNameSchema('last name'),
  email: z.string().trim().toLowerCase().pipe(z.email('Enter a valid email address')),
  username: z
    .string()
    .trim()
    .toLowerCase()
    .regex(USERNAME_PATTERN, 'Use 3 to 64 letters, numbers, dots, dashes or underscores'),
  departmentGroupId: z.string().min(1, 'Choose a department'),
  role: roleSchema,
  templateId: z.uuid().optional(),
  managerSubjectId: z.uuid('Choose a manager from the list').optional(),
  startDate: z.iso.date('Enter a valid date').optional(),
});
export type OnboardEmployeeInput = z.input<typeof onboardEmployeeSchema>;
export type OnboardEmployee = z.infer<typeof onboardEmployeeSchema>;

export const retryOnboardingSchema = onboardEmployeeSchema.pick({
  departmentGroupId: true,
  role: true,
  templateId: true,
  managerSubjectId: true,
  startDate: true,
});
export type RetryOnboarding = z.infer<typeof retryOnboardingSchema>;

export const onboardingSubjectParamsSchema = z.object({ subjectId: z.uuid() });

export const onboardStepSchema = z.object({
  name: z.enum(ONBOARDING_STEP_NAMES),
  status: z.enum(['done', 'failed', 'skipped']),
  message: z.string().optional(),
  label: z.string().optional(),
});
export type OnboardStep = z.infer<typeof onboardStepSchema>;

export const onboardResultSchema = z.object({
  status: z.enum(['complete', 'partial']),
  subjectId: z.string().min(1),
  steps: z.array(onboardStepSchema),
  temporaryPassword: z.string().min(1).optional(),
});
export type OnboardResult = z.infer<typeof onboardResultSchema>;

export const onboardingOptionsSchema = z.object({
  departments: z.array(z.object({ id: z.string().min(1), name: z.string(), path: z.string() })),
  roles: z.array(
    z.object({
      name: roleSchema,
      allowed: z.boolean(),
      reason: z.string().optional(),
    }),
  ),
});
export type OnboardingOptions = z.infer<typeof onboardingOptionsSchema>;

export { ADMIN_ROLE_REASON };

export function canAssignRole(
  callerRoles: readonly string[],
  role: string,
  policy: RolePolicy,
): boolean {
  return roleViolation(role, callerRoles, policy) === null;
}

export function roleOptions(
  callerRoles: readonly string[],
  policy: RolePolicy,
): OnboardingOptions['roles'] {
  return ONBOARDABLE_ROLES.map((name) => {
    const reason = roleViolation(name, callerRoles, policy);
    return reason === null ? { name, allowed: true } : { name, allowed: false, reason };
  });
}
