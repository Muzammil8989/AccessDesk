import { ONBOARDING_ERROR_CODES } from '@accessdesk/shared';
import { AppError } from '../../errors';

export const onboardingErrors = {
  roleNotAllowed: (reason: string) => new AppError(403, 'forbidden', reason),
  templateNotAllowed: (reason: string) => new AppError(403, 'forbidden', reason),
  unknownTemplate: () => new AppError(400, 'bad_request', 'The selected template does not exist'),
  retryNotAllowed: () =>
    new AppError(403, 'forbidden', 'This onboarding cannot be retried from this account'),
  unknownDepartment: () =>
    new AppError(400, 'bad_request', 'The selected department does not exist'),
  unknownManager: () =>
    new AppError(400, ONBOARDING_ERROR_CODES.unknownManager, 'The selected manager was not found'),
  managerDisabled: () =>
    new AppError(
      400,
      ONBOARDING_ERROR_CODES.managerDisabled,
      "The selected manager's account is disabled",
    ),
  usernameExists: () =>
    new AppError(409, ONBOARDING_ERROR_CODES.usernameExists, 'Username already exists'),
  emailExists: () => new AppError(409, ONBOARDING_ERROR_CODES.emailExists, 'Email already exists'),
};
