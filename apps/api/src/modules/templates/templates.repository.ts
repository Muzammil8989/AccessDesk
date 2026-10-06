import type { Template } from '@accessdesk/shared';

/** What the templates module needs from storage. Routes depend on this, not on Prisma. */
export interface TemplateRepository {
  /** All templates, by name, each with its items in order. */
  listWithItems(): Promise<Template[]>;
}
