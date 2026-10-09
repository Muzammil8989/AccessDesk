import { ONBOARDABLE_ROLES, type Template } from '@accessdesk/shared';
import type { PrismaClient } from '../../infra/db';
import type { TemplateRepository } from './templates.repository';

const INCLUDE_ITEMS = { items: { orderBy: { position: 'asc' } } } as const;

interface StoredTemplate {
  id: string;
  name: string;
  description: string | null;
  departmentRef: string | null;
  defaultRole: string | null;
  items: {
    id: string;
    title: string;
    description: string | null;
    kind: Template['items'][number]['kind'];
    targetRef: string | null;
    position: number;
  }[];
}

function toTemplate(stored: StoredTemplate): Template {
  const defaultRole = ONBOARDABLE_ROLES.find((role) => role === stored.defaultRole) ?? null;
  return {
    id: stored.id,
    name: stored.name,
    description: stored.description,
    departmentRef: stored.departmentRef,
    defaultRole,
    items: stored.items.map((item) => ({
      id: item.id,
      title: item.title,
      description: item.description,
      kind: item.kind,
      targetRef: item.targetRef,
      position: item.position,
    })),
  };
}

export class PrismaTemplateRepository implements TemplateRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async listWithItems(): Promise<Template[]> {
    const templates = await this.prisma.onboardingTemplate.findMany({
      orderBy: { name: 'asc' },
      include: INCLUDE_ITEMS,
    });
    return templates.map(toTemplate);
  }

  async findById(id: string): Promise<Template | null> {
    const template = await this.prisma.onboardingTemplate.findUnique({
      where: { id },
      include: INCLUDE_ITEMS,
    });
    return template ? toTemplate(template) : null;
  }
}
