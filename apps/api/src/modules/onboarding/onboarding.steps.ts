import type { IdentityProvider } from '@accessdesk/identity';
import type { OnboardEmployee, OnboardableRole } from '@accessdesk/shared';
import type { ChecklistRepository } from '../checklists/checklists.repository';
import type { OnboardingStep, StepContext } from './onboarding.runner';

export interface Department {
  id: string;
  name: string;
}

export function requireSubject(context: StepContext): string {
  if (context.subjectId === null) throw new Error('The user has not been created yet');
  return context.subjectId;
}

export function createUserStep(
  identity: IdentityProvider,
  employee: OnboardEmployee,
  temporaryPassword: string,
): OnboardingStep {
  return {
    name: 'create_user',
    satisfied: false,
    details: () => ({}),
    async run(context) {
      context.subjectId = await identity.createUser({
        username: employee.username,
        email: employee.email,
        firstName: employee.firstName,
        lastName: employee.lastName,
        enabled: true,
        emailVerified: true,
        initialPassword: { value: temporaryPassword, temporary: true },
      });
    },
  };
}

export function existingUserStep(): OnboardingStep {
  return {
    name: 'create_user',
    satisfied: true,
    details: () => ({}),
    run: async () => undefined,
  };
}

export function addToGroupStep(
  identity: IdentityProvider,
  department: Department,
  satisfied: boolean,
): OnboardingStep {
  return {
    name: 'add_to_group',
    satisfied,
    details: () => ({ groupId: department.id, groupName: department.name }),
    run: async (context) => identity.addUserToGroup(requireSubject(context), department.id),
  };
}

export function assignRoleStep(
  identity: IdentityProvider,
  role: OnboardableRole,
  satisfied: boolean,
): OnboardingStep {
  return {
    name: 'assign_role',
    satisfied,
    details: () => ({ role }),
    run: async (context) => identity.addUserRoles(requireSubject(context), [role]),
  };
}

export interface ChecklistTask {
  title: string;
  description: string | null;
}

export interface CreateChecklistStepOptions {
  checklists: Pick<ChecklistRepository, 'create'>;
  templateId: string;
  tasks: readonly ChecklistTask[];
  actorId: string;
  now: () => Date;
  satisfied: boolean;
}

export function createChecklistStep(options: CreateChecklistStepOptions): OnboardingStep {
  const { checklists, templateId, tasks, actorId, now, satisfied } = options;
  return {
    name: 'create_checklist',
    satisfied,
    details: () => ({ templateId, taskCount: String(tasks.length) }),
    run: async (context) =>
      checklists.create({
        subjectId: requireSubject(context),
        templateId,
        createdBy: actorId,
        at: now(),
        tasks: [...tasks],
      }),
  };
}
