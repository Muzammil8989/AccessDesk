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

/** Where a checklist's tasks come from: the template that supplies them, and the tasks. */
export interface ChecklistSource {
  templateId: string | null;
  tasks: readonly ChecklistTask[];
}

export interface CreateChecklistStepOptions {
  checklists: Pick<ChecklistRepository, 'create'>;
  /**
   * Called only when the checklist is created, so a checklist that exists costs no lookup and a
   * failed lookup fails this step, not the whole onboarding.
   */
  resolveSource: () => Promise<ChecklistSource>;
  managerSubjectId: string | null;
  startDate: string | null;
  actorId: string;
  now: () => Date;
  satisfied: boolean;
}

export function createChecklistStep(options: CreateChecklistStepOptions): OnboardingStep {
  const { checklists, resolveSource, managerSubjectId, startDate, actorId, now, satisfied } =
    options;
  let source: ChecklistSource | null = null;
  return {
    name: 'create_checklist',
    satisfied,
    details: () => ({
      ...(source && { taskCount: String(source.tasks.length) }),
      ...(source?.templateId && { templateId: source.templateId }),
      ...(managerSubjectId && { managerSubjectId }),
      ...(startDate && { startDate }),
    }),
    run: async (context) => {
      source = await resolveSource();
      await checklists.create({
        subjectId: requireSubject(context),
        templateId: source.templateId,
        createdBy: actorId,
        at: now(),
        managerSubjectId,
        startDate,
        tasks: [...source.tasks],
      });
    },
  };
}
