import { IdentityProviderError, type IdentityProvider } from '@accessdesk/identity';
import {
  roleOptions,
  roleViolation,
  templateViolation,
  type OnboardEmployee,
  type OnboardResult,
  type OnboardingOptions,
  type RetryOnboarding,
  type RolePolicy,
  type Template,
} from '@accessdesk/shared';
import type { FastifyBaseLogger } from 'fastify';
import type { AuditReader, AuditWriter } from '../audit/audit.repository';
import type { ChecklistRepository } from '../checklists/checklists.repository';
import type { TemplateRepository } from '../templates/templates.repository';
import { createAuditingObserver, ONBOARDING_AUDIT_ACTIONS } from './onboarding.audit';
import { onboardingErrors } from './onboarding.errors';
import { runSteps, type OnboardingStep } from './onboarding.runner';
import {
  addToGroupStep,
  assignRoleStep,
  createChecklistStep,
  createUserStep,
  existingUserStep,
  requireSubject,
  type Department,
} from './onboarding.steps';
import { templateSteps } from './onboarding.template-steps';

export const RETRY_WINDOW_MS = 24 * 60 * 60 * 1000;

export interface OnboardingServiceDeps {
  identity: IdentityProvider;
  audit: AuditWriter & AuditReader;
  templates: Pick<TemplateRepository, 'findById'>;
  checklists: Pick<ChecklistRepository, 'create' | 'exists'>;
  clock: () => Date;
  generatePassword: () => string;
  adminRoles: readonly string[];
  superAdminRole: string;
}

export interface Caller {
  actorId: string;
  roles: readonly string[];
  requestId: string;
  log: Pick<FastifyBaseLogger, 'warn' | 'error'>;
}

export class OnboardingService {
  constructor(private readonly deps: OnboardingServiceDeps) {}

  private get policy(): RolePolicy {
    return { adminRoles: this.deps.adminRoles, superAdminRole: this.deps.superAdminRole };
  }

  async getOptions(caller: Pick<Caller, 'roles'>): Promise<OnboardingOptions> {
    const groups = await this.deps.identity.listGroups();
    return {
      departments: groups
        .map(({ id, name, path }) => ({ id, name, path }))
        .sort((a, b) => a.name.localeCompare(b.name)),
      roles: roleOptions(caller.roles, this.policy),
    };
  }

  async onboard(input: OnboardEmployee, caller: Caller): Promise<OnboardResult> {
    const { identity } = this.deps;
    this.assertRoleAllowed(caller, input.role);
    const template = await this.loadTemplate(input.templateId, caller);

    const [groups, sameUsername, sameEmail] = await Promise.all([
      identity.listGroups(),
      identity.findUsers({ username: input.username, exact: true }),
      identity.findUsers({ email: input.email, exact: true }),
    ]);
    const department = this.findDepartment(groups, input.departmentGroupId);
    if (sameUsername.length > 0) throw onboardingErrors.usernameExists();
    if (sameEmail.length > 0) throw onboardingErrors.emailExists();

    const temporaryPassword = this.deps.generatePassword();
    const context = { subjectId: null as string | null };
    const outcome = await runSteps(
      [
        createUserStep(identity, input, temporaryPassword),
        addToGroupStep(identity, department, false),
        assignRoleStep(identity, input.role, false),
        ...(template
          ? templateSteps({ identity, template, groups, department, role: input.role })
          : []),
        ...this.checklistSteps(template, caller, false),
      ],
      context,
      this.observerFor(caller),
    );

    if (outcome.failure?.step === 'create_user') {
      throw await this.translateCreateFailure(outcome.failure.error, input);
    }
    return {
      status: outcome.failure ? 'partial' : 'complete',
      subjectId: requireSubject(context),
      steps: outcome.results,
      temporaryPassword,
    };
  }

  async retry(subjectId: string, input: RetryOnboarding, caller: Caller): Promise<OnboardResult> {
    const { identity, audit, clock } = this.deps;
    this.assertRoleAllowed(caller, input.role);
    const template = await this.loadTemplate(input.templateId, caller);

    const [groups, createdByCaller] = await Promise.all([
      identity.listGroups(),
      audit.hasSuccessSince({
        action: ONBOARDING_AUDIT_ACTIONS.create_user,
        actorId: caller.actorId,
        targetSubjectId: subjectId,
        since: new Date(clock().getTime() - RETRY_WINDOW_MS),
      }),
    ]);
    if (!createdByCaller) throw onboardingErrors.retryNotAllowed();
    const department = this.findDepartment(groups, input.departmentGroupId);

    const [memberships, roles] = await Promise.all([
      identity.getUserGroups(subjectId),
      identity.getUserRoles(subjectId),
    ]);
    const steps: OnboardingStep[] = [
      existingUserStep(),
      addToGroupStep(
        identity,
        department,
        memberships.some((group) => group.id === department.id),
      ),
      assignRoleStep(
        identity,
        input.role,
        roles.some((role) => role.name === input.role),
      ),
      ...(template
        ? templateSteps({
            identity,
            template,
            groups,
            department,
            role: input.role,
            memberships,
            assignedRoles: roles,
          })
        : []),
      ...this.checklistSteps(template, caller, await this.deps.checklists.exists(subjectId)),
    ];
    const outcome = await runSteps(steps, { subjectId }, this.observerFor(caller));

    return {
      status: outcome.failure ? 'partial' : 'complete',
      subjectId,
      steps: outcome.results,
    };
  }

  private checklistSteps(
    template: Template | null,
    caller: Pick<Caller, 'actorId'>,
    satisfied: boolean,
  ): OnboardingStep[] {
    const tasks = (template?.items ?? [])
      .filter((item) => item.kind === 'MANUAL_TASK')
      .map(({ title, description }) => ({ title, description }));
    if (!template || tasks.length === 0) return [];
    return [
      createChecklistStep({
        checklists: this.deps.checklists,
        templateId: template.id,
        tasks,
        actorId: caller.actorId,
        now: this.deps.clock,
        satisfied,
      }),
    ];
  }

  private assertRoleAllowed(caller: Pick<Caller, 'roles'>, role: string): void {
    const reason = roleViolation(role, caller.roles, this.policy);
    if (reason !== null) throw onboardingErrors.roleNotAllowed(reason);
  }

  private async loadTemplate(
    templateId: string | undefined,
    caller: Pick<Caller, 'roles'>,
  ): Promise<Template | null> {
    if (templateId === undefined) return null;
    const template = await this.deps.templates.findById(templateId);
    if (!template) throw onboardingErrors.unknownTemplate();
    const reason = templateViolation(template, caller.roles, this.policy);
    if (reason !== null) throw onboardingErrors.templateNotAllowed(reason);
    return template;
  }

  private findDepartment(groups: readonly Department[], departmentGroupId: string): Department {
    const department = groups.find((group) => group.id === departmentGroupId);
    if (!department) throw onboardingErrors.unknownDepartment();
    return { id: department.id, name: department.name };
  }

  private observerFor(caller: Caller) {
    return createAuditingObserver({
      audit: this.deps.audit,
      log: caller.log,
      actorId: caller.actorId,
      requestId: caller.requestId,
    });
  }

  private async translateCreateFailure(error: unknown, input: OnboardEmployee): Promise<unknown> {
    if (!(error instanceof IdentityProviderError) || error.status !== 409) return error;

    const [sameUsername, sameEmail] = await Promise.all([
      this.deps.identity.findUsers({ username: input.username, exact: true }),
      this.deps.identity.findUsers({ email: input.email, exact: true }),
    ]).catch(() => [[], []]);
    return sameUsername.length === 0 && sameEmail.length > 0
      ? onboardingErrors.emailExists()
      : onboardingErrors.usernameExists();
  }
}
