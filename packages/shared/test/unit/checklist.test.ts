import { describe, expect, it } from 'vitest';
import {
  CHECKLIST_PAGE_MAX,
  checklistDetailSchema,
  checklistItemParamsSchema,
  checklistListSchema,
  checklistParamsSchema,
  listChecklistsQuerySchema,
  setChecklistItemSchema,
} from '../../src/index';

const ID = '8b1c5f5e-7a62-4a0a-9a52-2f1b8f8c1e11';

describe('listChecklistsQuerySchema', () => {
  it('defaults to the open checklists, from the start, one full page', () => {
    expect(listChecklistsQuerySchema.parse({})).toEqual({
      status: 'open',
      first: 0,
      max: CHECKLIST_PAGE_MAX,
    });
  });

  it('coerces numbers from a query string', () => {
    expect(listChecklistsQuerySchema.parse({ status: 'done', first: '20', max: '5' })).toEqual({
      status: 'done',
      first: 20,
      max: 5,
    });
  });

  it('caps a page at 20', () => {
    expect(CHECKLIST_PAGE_MAX).toBe(20);
    expect(listChecklistsQuerySchema.safeParse({ max: 20 }).success).toBe(true);
    expect(listChecklistsQuerySchema.safeParse({ max: 21 }).success).toBe(false);
  });

  it.each([{ status: 'all' }, { max: 0 }, { first: -1 }, { max: 1.5 }, { first: 'x' }])(
    'rejects %j',
    (query) => {
      expect(listChecklistsQuerySchema.safeParse(query).success).toBe(false);
    },
  );
});

describe('checklist params and body', () => {
  it('needs UUIDs for the subject and the task', () => {
    expect(checklistParamsSchema.safeParse({ subjectId: ID }).success).toBe(true);
    expect(checklistParamsSchema.safeParse({ subjectId: '../x' }).success).toBe(false);
    expect(checklistItemParamsSchema.safeParse({ subjectId: ID, itemId: ID }).success).toBe(true);
    expect(checklistItemParamsSchema.safeParse({ subjectId: ID, itemId: 'x' }).success).toBe(false);
  });

  it('needs a real boolean for done', () => {
    expect(setChecklistItemSchema.parse({ done: false })).toEqual({ done: false });
    for (const body of [{}, { done: 'true' }, { done: 1 }, { done: null }]) {
      expect(setChecklistItemSchema.safeParse(body).success).toBe(false);
    }
  });
});

describe('response schemas', () => {
  const when = '2026-10-09T12:00:00.000Z';

  it('accepts a list whose person may be unknown', () => {
    expect(
      checklistListSchema.safeParse({
        total: 1,
        first: 0,
        max: 20,
        items: [
          {
            subjectId: ID,
            status: 'open',
            createdAt: when,
            completedAt: null,
            totalCount: 3,
            doneCount: 1,
            person: null,
          },
        ],
      }).success,
    ).toBe(true);
  });

  it('accepts a detail with tasks and rejects an unknown task status', () => {
    const detail = {
      subjectId: ID,
      status: 'done',
      createdAt: when,
      completedAt: when,
      templateName: 'Developer',
      person: { displayName: 'Ann Lee', username: 'ann.lee' },
      items: [
        {
          id: ID,
          title: 'Order laptop',
          description: null,
          status: 'done',
          position: 0,
          completedAt: when,
        },
      ],
    };
    expect(checklistDetailSchema.safeParse(detail).success).toBe(true);
    expect(
      checklistDetailSchema.safeParse({
        ...detail,
        items: [{ ...detail.items[0], status: 'maybe' }],
      }).success,
    ).toBe(false);
  });
});
