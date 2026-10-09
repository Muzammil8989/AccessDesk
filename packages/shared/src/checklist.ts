import { z } from 'zod';

export const CHECKLIST_PAGE_MAX = 20;
export const CHECKLIST_FILTERS = ['open', 'done'] as const;

export const listChecklistsQuerySchema = z.object({
  status: z.enum(CHECKLIST_FILTERS).default('open'),
  first: z.coerce.number().int().min(0).default(0),
  max: z.coerce.number().int().min(1).max(CHECKLIST_PAGE_MAX).default(CHECKLIST_PAGE_MAX),
});
export type ListChecklistsQuery = z.infer<typeof listChecklistsQuerySchema>;

export const checklistParamsSchema = z.object({ subjectId: z.uuid() });
export const checklistItemParamsSchema = z.object({ subjectId: z.uuid(), itemId: z.uuid() });

export const setChecklistItemSchema = z.object({ done: z.boolean() });
export type SetChecklistItem = z.infer<typeof setChecklistItemSchema>;

export const checklistPersonSchema = z.object({
  displayName: z.string(),
  username: z.string(),
});
export type ChecklistPerson = z.infer<typeof checklistPersonSchema>;

export const checklistStatusSchema = z.enum(['open', 'done', 'cancelled']);

export const checklistSummarySchema = z.object({
  subjectId: z.string(),
  status: checklistStatusSchema,
  createdAt: z.iso.datetime(),
  completedAt: z.iso.datetime().nullable(),
  totalCount: z.number().int().min(0),
  doneCount: z.number().int().min(0),
  person: checklistPersonSchema.nullable(),
});
export type ChecklistSummary = z.infer<typeof checklistSummarySchema>;

export const checklistListSchema = z.object({
  items: z.array(checklistSummarySchema),
  total: z.number().int().min(0),
  first: z.number().int().min(0),
  max: z.number().int().min(1),
});
export type ChecklistList = z.infer<typeof checklistListSchema>;

export const checklistItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  status: z.enum(['pending', 'done', 'skipped', 'failed']),
  position: z.number().int(),
  completedAt: z.iso.datetime().nullable(),
});
export type ChecklistItem = z.infer<typeof checklistItemSchema>;

export const checklistDetailSchema = z.object({
  subjectId: z.string(),
  status: checklistStatusSchema,
  createdAt: z.iso.datetime(),
  completedAt: z.iso.datetime().nullable(),
  templateName: z.string().nullable(),
  person: checklistPersonSchema.nullable(),
  items: z.array(checklistItemSchema),
});
export type ChecklistDetail = z.infer<typeof checklistDetailSchema>;
