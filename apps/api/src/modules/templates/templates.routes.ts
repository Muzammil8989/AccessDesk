import type { TemplateList } from '@accessdesk/shared';
import type { FastifyInstance } from 'fastify';
import type { TemplateRepository } from './templates.repository';

export function templateRoutes(app: FastifyInstance, templates: TemplateRepository): void {
  app.get('/templates', async (): Promise<TemplateList> => {
    return { items: await templates.listWithItems() };
  });
}
