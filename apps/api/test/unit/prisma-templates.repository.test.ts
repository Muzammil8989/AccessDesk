import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '../../src/infra/db';
import { PrismaTemplateRepository } from '../../src/modules/templates/prisma-templates.repository';

describe('PrismaTemplateRepository', () => {
  it('asks for templates by name with items in position order', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const prisma = { onboardingTemplate: { findMany } } as unknown as PrismaClient;

    await new PrismaTemplateRepository(prisma).listWithItems();

    expect(findMany).toHaveBeenCalledWith({
      orderBy: { name: 'asc' },
      include: { items: { orderBy: { position: 'asc' } } },
    });
  });

  it('returns only the API fields, dropping timestamps and foreign keys', async () => {
    const findMany = vi.fn().mockResolvedValue([
      {
        id: 't1',
        name: 'Sales',
        description: 'Sales hires',
        createdAt: new Date(),
        updatedAt: new Date(),
        items: [
          {
            id: 'i1',
            templateId: 't1',
            title: 'Add to Sales group',
            description: null,
            kind: 'GROUP_MEMBERSHIP',
            targetRef: '/Sales',
            position: 0,
          },
        ],
      },
    ]);
    const prisma = { onboardingTemplate: { findMany } } as unknown as PrismaClient;

    const [template] = await new PrismaTemplateRepository(prisma).listWithItems();

    expect(template).toEqual({
      id: 't1',
      name: 'Sales',
      description: 'Sales hires',
      items: [
        {
          id: 'i1',
          title: 'Add to Sales group',
          description: null,
          kind: 'GROUP_MEMBERSHIP',
          position: 0,
        },
      ],
    });
  });
});
