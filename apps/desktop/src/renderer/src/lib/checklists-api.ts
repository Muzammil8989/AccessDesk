import {
  checklistDetailSchema,
  checklistListSchema,
  type ChecklistDetail,
  type ListChecklistsQuery,
} from '@accessdesk/shared';
import { keepPreviousData, queryOptions } from '@tanstack/react-query';
import { ApiRequestError, apiGet, parseResponse } from './api';

export const CHECKLIST_PAGE_SIZE = 20;
const MAX_ATTEMPTS = 2;

const retryable = (count: number, error: Error) =>
  error instanceof ApiRequestError && error.retryable && count < MAX_ATTEMPTS;

export const checklistListQuery = (status: ListChecklistsQuery['status'], page: number) =>
  queryOptions({
    queryKey: ['checklists', status, page],
    queryFn: () =>
      apiGet('/checklists', checklistListSchema, {
        status,
        first: page * CHECKLIST_PAGE_SIZE,
        max: CHECKLIST_PAGE_SIZE,
      }),
    placeholderData: keepPreviousData,
    retry: retryable,
  });

export const checklistDetailQuery = (subjectId: string) =>
  queryOptions({
    queryKey: ['checklist', subjectId],
    queryFn: () => apiGet(`/checklists/${subjectId}`, checklistDetailSchema),
    retry: retryable,
  });

export interface ChecklistItemChange {
  subjectId: string;
  itemId: string;
  done: boolean;
}

export interface ChecklistClosedChange {
  subjectId: string;
  closed: boolean;
}

export async function setChecklistClosed({
  subjectId,
  closed,
}: ChecklistClosedChange): Promise<ChecklistDetail> {
  return parseResponse(
    await window.accessdesk.api.checklists.setClosed(subjectId, { closed }),
    checklistDetailSchema,
  );
}

export async function setChecklistItem({
  subjectId,
  itemId,
  done,
}: ChecklistItemChange): Promise<ChecklistDetail> {
  return parseResponse(
    await window.accessdesk.api.checklists.setItem(subjectId, itemId, { done }),
    checklistDetailSchema,
  );
}
