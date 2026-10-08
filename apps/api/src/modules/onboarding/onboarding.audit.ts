import { IdentityProviderError } from '@accessdesk/identity';
import type { OnboardingStepName } from '@accessdesk/shared';
import type { FastifyBaseLogger } from 'fastify';
import type { AuditOutcome, AuditWriter } from '../audit/audit.repository';
import type { OnboardingStep, StepContext, StepObserver } from './onboarding.runner';

export const ONBOARDING_AUDIT_ACTIONS: Record<OnboardingStepName, string> = {
  create_user: 'onboarding.create_user',
  add_to_group: 'onboarding.add_to_group',
  assign_role: 'onboarding.assign_role',
};

export interface AuditingObserverOptions {
  audit: AuditWriter;
  log: Pick<FastifyBaseLogger, 'warn' | 'error'>;
  actorId: string;
  requestId: string;
}

export function createAuditingObserver(options: AuditingObserverOptions): StepObserver {
  const { audit, log, actorId, requestId } = options;

  async function record(
    step: OnboardingStep,
    context: StepContext,
    outcome: AuditOutcome,
  ): Promise<void> {
    const action = ONBOARDING_AUDIT_ACTIONS[step.name];
    const details = step.details();
    try {
      await audit.record({
        actorId,
        action,
        outcome,
        targetSubjectId: context.subjectId ?? undefined,
        requestId,
        details: Object.keys(details).length > 0 ? details : undefined,
      });
    } catch (error) {
      log.error(
        { requestId, action, errorName: error instanceof Error ? error.name : 'unknown' },
        'Audit log write failed',
      );
    }
  }

  return {
    succeeded: (step, context) => record(step, context, 'SUCCESS'),
    async failed(step, context, error) {
      log.warn(
        {
          requestId,
          step: step.name,
          identityProviderStatus: error instanceof IdentityProviderError ? error.status : undefined,
        },
        'Onboarding step failed',
      );
      await record(step, context, 'FAILURE');
    },
  };
}
