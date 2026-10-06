import type { Template } from '@accessdesk/shared';
import type { PrismaClient } from '../../infra/db';
import type { TemplateRepository } from './templates.repository';

export class PrismaTemplateRepository implements TemplateRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async listWithItems(): Promise<Template[]> {
    const templates = await this.prisma.onboardingTemplate.findMany({
      orderBy: { name: 'asc' },
      include: { items: { orderBy: { position: 'asc' } } },
    });
    return templates.map((t) => ({
      id: t.id,
      name: t.name,
      description: t.description,
      items: t.items.map((i) => ({
        id: i.id,
        title: i.title,
        description: i.description,
        kind: i.kind,
        position: i.position,
      })),
    }));
  }
}
