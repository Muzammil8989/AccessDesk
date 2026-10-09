import { IdentityProviderError } from '@accessdesk/identity';
import type { OnboardStep, OnboardingStepName } from '@accessdesk/shared';

export interface StepContext {
  subjectId: string | null;
}

export interface OnboardingStep {
  readonly name: OnboardingStepName;
  readonly label?: string;
  readonly satisfied: boolean;
  run(context: StepContext): Promise<void>;
  details(): Record<string, string>;
}

export interface StepObserver {
  succeeded(step: OnboardingStep, context: StepContext): Promise<void>;
  failed(step: OnboardingStep, context: StepContext, error: unknown): Promise<void>;
}

export interface RunOutcome {
  results: OnboardStep[];
  failure?: { step: OnboardingStepName; error: unknown };
}

export class StepFailure extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StepFailure';
  }
}

const ALREADY_DONE = 'Already done';
const NOT_RUN = 'Not run because an earlier step failed';

function resultOf(
  step: OnboardingStep,
  status: OnboardStep['status'],
  message?: string,
): OnboardStep {
  return {
    name: step.name,
    status,
    ...(message !== undefined && { message }),
    ...(step.label !== undefined && { label: step.label }),
  };
}

export function describeStepFailure(error: unknown): string {
  if (error instanceof StepFailure) return error.message;
  if (error instanceof IdentityProviderError) {
    if (error.status === 403) {
      return 'The identity provider refused this step. Your account may be missing a permission.';
    }
    if (error.status === 404) return 'The identity provider could not find what this step needs.';
    return 'The identity provider could not complete this step.';
  }
  return 'This step failed unexpectedly.';
}

export async function runSteps(
  steps: readonly OnboardingStep[],
  context: StepContext,
  observer: StepObserver,
): Promise<RunOutcome> {
  const results: OnboardStep[] = [];

  for (const [index, step] of steps.entries()) {
    if (step.satisfied) {
      results.push(resultOf(step, 'skipped', ALREADY_DONE));
      continue;
    }
    try {
      await step.run(context);
    } catch (error) {
      results.push(resultOf(step, 'failed', describeStepFailure(error)));
      await observer.failed(step, context, error);
      for (const pending of steps.slice(index + 1)) {
        results.push(resultOf(pending, 'skipped', NOT_RUN));
      }
      return { results, failure: { step: step.name, error } };
    }
    results.push(resultOf(step, 'done'));
    await observer.succeeded(step, context);
  }
  return { results };
}
