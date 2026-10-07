import type { Template } from '@accessdesk/shared';

export interface TemplateRepository {
  listWithItems(): Promise<Template[]>;
}
