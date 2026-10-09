import type { IdentityGroup, IdentityProvider, IdentityRole } from '@accessdesk/identity';
import type { Template, TemplateItem } from '@accessdesk/shared';
import { StepFailure, type OnboardingStep } from './onboarding.runner';
import { requireSubject, type Department } from './onboarding.steps';

export interface TemplateStepsInput {
  identity: IdentityProvider;
  template: Template;
  groups: readonly IdentityGroup[];
  department: Department;
  role: string;
  memberships?: readonly IdentityGroup[];
  assignedRoles?: readonly IdentityRole[];
}

const sameName = (a: string, b: string): boolean => a.toLowerCase() === b.toLowerCase();

function once<T>(load: () => Promise<T>): () => Promise<T> {
  let pending: Promise<T> | undefined;
  return () => (pending ??= load());
}

function missingGroup(path: string): StepFailure {
  const note =
    path.split('/').filter(Boolean).length > 1 ? ' (only top-level groups are supported)' : '';
  return new StepFailure(`Group "${path}" does not exist in the identity provider${note}`);
}

function groupStep(
  input: TemplateStepsInput,
  item: TemplateItem,
  path: string | null,
  group: IdentityGroup | undefined,
): OnboardingStep {
  return {
    name: 'template_add_to_group',
    label: path ?? undefined,
    satisfied: group !== undefined && (input.memberships?.some((m) => m.id === group.id) ?? false),
    details: () => ({
      templateId: input.template.id,
      itemId: item.id,
      groupPath: path ?? '',
      ...(group && { groupId: group.id }),
    }),
    async run(context) {
      if (!path) throw new StepFailure('This template item does not name a group');
      if (!group) throw missingGroup(path);
      await input.identity.addUserToGroup(requireSubject(context), group.id);
    },
  };
}

function roleStep(
  input: TemplateStepsInput,
  item: TemplateItem,
  name: string | null,
  catalog: () => Promise<IdentityRole[]>,
): OnboardingStep {
  return {
    name: 'template_assign_role',
    label: name ?? undefined,
    satisfied:
      name !== null && (input.assignedRoles?.some((role) => sameName(role.name, name)) ?? false),
    details: () => ({ templateId: input.template.id, itemId: item.id, role: name ?? '' }),
    async run(context) {
      if (!name) throw new StepFailure('This template item does not name a role');
      const roles = await catalog();
      const found =
        roles.find((role) => role.name === name) ?? roles.find((role) => sameName(role.name, name));
      if (!found) throw new StepFailure(`Role "${name}" does not exist in the identity provider`);
      await input.identity.addUserRoles(requireSubject(context), [found.name]);
    },
  };
}

export function templateSteps(input: TemplateStepsInput): OnboardingStep[] {
  const catalog = once(() => input.identity.listRoles());
  const seen = new Set<string>();
  const steps: OnboardingStep[] = [];

  for (const item of input.template.items) {
    const ref = item.targetRef?.trim() || null;

    if (item.kind === 'GROUP_MEMBERSHIP') {
      const group = ref ? input.groups.find((candidate) => candidate.path === ref) : undefined;
      const key = `group:${ref ?? item.id}`;
      if (seen.has(key) || group?.id === input.department.id) continue;
      seen.add(key);
      steps.push(groupStep(input, item, ref, group));
    }

    if (item.kind === 'ROLE') {
      const key = `role:${ref?.toLowerCase() ?? item.id}`;
      if (seen.has(key) || (ref !== null && sameName(ref, input.role))) continue;
      seen.add(key);
      steps.push(roleStep(input, item, ref, catalog));
    }
  }
  return steps;
}
