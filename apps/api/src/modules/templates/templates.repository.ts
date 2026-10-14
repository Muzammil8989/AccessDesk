import type { Template } from '@accessdesk/shared';

export interface TemplateRepository {
  listWithItems(): Promise<Template[]>;
  findById(id: string): Promise<Template | null>;
  /** The oldest template flagged as the default, or null when there is none. */
  findDefault(): Promise<Template | null>;
}
