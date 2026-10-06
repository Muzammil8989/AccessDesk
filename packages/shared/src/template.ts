import { z } from 'zod';

export const templateItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  kind: z.string(),
  position: z.number().int(),
});
export type TemplateItem = z.infer<typeof templateItemSchema>;

export const templateSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  items: z.array(templateItemSchema),
});
export type Template = z.infer<typeof templateSchema>;

export const templateListSchema = z.object({ items: z.array(templateSchema) });
export type TemplateList = z.infer<typeof templateListSchema>;
