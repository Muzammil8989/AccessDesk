import { IdentityProviderError } from '@accessdesk/identity';
import type { OnboardStep, OnboardingStepName } from '@accessdesk/shared';

export interface StepContext {
  subjectId: string | null;
}

export interface OnboardingStep {
  readonly name: OnboardingStepName;
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

const ALREADY_DONE = 'Already done';
const NOT_RUN = 'Not run because an earlier step failed';

export function describeStepFailure(error: unknown): string {
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
      results.push({ name: step.name, status: 'skipped', message: ALREADY_DONE });
      continue;
    }
    try {
      await step.run(context);
    } catch (error) {
      results.push({ name: step.name, status: 'failed', message: describeStepFailure(error) });
      await observer.failed(step, context, error);
      for (const pending of steps.slice(index + 1)) {
        results.push({ name: pending.name, status: 'skipped', message: NOT_RUN });
      }
      return { results, failure: { step: step.name, error } };
    }
    results.push({ name: step.name, status: 'done' });
    await observer.succeeded(step, context);
  }
  return { results };
}
