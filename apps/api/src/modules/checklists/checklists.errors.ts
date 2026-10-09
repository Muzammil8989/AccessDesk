import { AppError } from '../../errors';

export const checklistErrors = {
  notFound: () => new AppError(404, 'not_found', 'Checklist not found'),
  itemNotFound: () => new AppError(404, 'not_found', 'Checklist task not found'),
};
