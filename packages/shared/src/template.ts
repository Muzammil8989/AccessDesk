import { z } from 'zod';
import { ONBOARDABLE_ROLES } from './onboarding';

export const ITEM_KINDS = ['GROUP_MEMBERSHIP', 'ROLE', 'MANUAL_TASK'] as const;
export type ItemKind = (typeof ITEM_KINDS)[number];

export const templateItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  kind: z.enum(ITEM_KINDS),
  targetRef: z.string().nullable(),
  position: z.number().int(),
});
export type TemplateItem = z.infer<typeof templateItemSchema>;

export const templateSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  departmentRef: z.string().nullable(),
  defaultRole: z.enum(ONBOARDABLE_ROLES).nullable(),
  items: z.array(templateItemSchema),
});
export type Template = z.infer<typeof templateSchema>;

export const templateListSchema = z.object({ items: z.array(templateSchema) });
export type TemplateList = z.infer<typeof templateListSchema>;
