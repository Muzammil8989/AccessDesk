import {
  onboardResultSchema,
  onboardingOptionsSchema,
  type OnboardEmployee,
  type OnboardResult,
  type RetryOnboarding,
} from '@accessdesk/shared';
import { queryOptions } from '@tanstack/react-query';
import { ApiRequestError, apiGet, parseResponse } from './api';

const OPTIONS_STALE_TIME_MS = 5 * 60_000;
const MAX_OPTION_ATTEMPTS = 2;

export const onboardingOptionsQuery = queryOptions({
  queryKey: ['onboarding-options'],
  queryFn: () => apiGet('/onboarding/options', onboardingOptionsSchema),
  staleTime: OPTIONS_STALE_TIME_MS,
  retry: (count, error) =>
    error instanceof ApiRequestError && error.retryable && count < MAX_OPTION_ATTEMPTS,
});

export async function createOnboarding(input: OnboardEmployee): Promise<OnboardResult> {
  return parseResponse(await window.accessdesk.api.onboarding.create(input), onboardResultSchema);
}

export interface RetryRequest {
  subjectId: string;
  input: RetryOnboarding;
}

export async function retryOnboarding({ subjectId, input }: RetryRequest): Promise<OnboardResult> {
  return parseResponse(
    await window.accessdesk.api.onboarding.retry(subjectId, input),
    onboardResultSchema,
  );
}
