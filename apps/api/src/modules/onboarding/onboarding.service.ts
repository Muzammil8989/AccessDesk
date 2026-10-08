import { IdentityProviderError, type IdentityProvider } from '@accessdesk/identity';
import {
  canAssignRole,
  roleOptions,
  type OnboardEmployee,
  type OnboardResult,
  type OnboardableRole,
  type OnboardingOptions,
  type RetryOnboarding,
} from '@accessdesk/shared';
import type { FastifyBaseLogger } from 'fastify';
import type { AuditReader, AuditWriter } from '../audit/audit.repository';
import { createAuditingObserver, ONBOARDING_AUDIT_ACTIONS } from './onboarding.audit';
import { onboardingErrors } from './onboarding.errors';
import { runSteps, type OnboardingStep } from './onboarding.runner';
import {
  addToGroupStep,
  assignRoleStep,
  createUserStep,
  existingUserStep,
  requireSubject,
  type Department,
} from './onboarding.steps';

export const RETRY_WINDOW_MS = 24 * 60 * 60 * 1000;

export interface OnboardingServiceDeps {
  identity: IdentityProvider;
  audit: AuditWriter & AuditReader;
  clock: () => Date;
  generatePassword: () => string;
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

  async getOptions(caller: Pick<Caller, 'roles'>): Promise<OnboardingOptions> {
    const groups = await this.deps.identity.listGroups();
    return {
      departments: groups
        .map(({ id, name }) => ({ id, name }))
        .sort((a, b) => a.name.localeCompare(b.name)),
      roles: roleOptions(caller.roles, this.deps.superAdminRole),
    };
  }

  async onboard(input: OnboardEmployee, caller: Caller): Promise<OnboardResult> {
    const { identity } = this.deps;
    this.assertRoleAllowed(caller, input.role);

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
    ];
    const outcome = await runSteps(steps, { subjectId }, this.observerFor(caller));

    return {
      status: outcome.failure ? 'partial' : 'complete',
      subjectId,
      steps: outcome.results,
    };
  }

  private assertRoleAllowed(caller: Pick<Caller, 'roles'>, role: OnboardableRole): void {
    if (!canAssignRole(caller.roles, role, this.deps.superAdminRole)) {
      throw onboardingErrors.roleNotAllowed();
    }
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
