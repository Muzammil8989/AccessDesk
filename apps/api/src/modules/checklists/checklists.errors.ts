import { CHECKLIST_ERROR_CODES } from '@accessdesk/shared';
import { AppError } from '../../errors';

export const checklistErrors = {
  notFound: () => new AppError(404, 'not_found', 'Checklist not found'),
  itemNotFound: () => new AppError(404, 'not_found', 'Checklist task not found'),
  hasTasks: () =>
    new AppError(
      409,
      CHECKLIST_ERROR_CODES.hasTasks,
      'A checklist with tasks is done when every task is done',
    ),
};
