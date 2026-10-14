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
        departmentRef: '/Sales',
        defaultRole: 'member',
        isDefault: false,
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
      departmentRef: '/Sales',
      defaultRole: 'member',
      isDefault: false,
      items: [
        {
          id: 'i1',
          title: 'Add to Sales group',
          description: null,
          kind: 'GROUP_MEMBERSHIP',
          targetRef: '/Sales',
          position: 0,
        },
      ],
    });
  });

  it('finds one template by id with its items in position order', async () => {
    const findUnique = vi.fn().mockResolvedValue({
      id: 't1',
      name: 'Dev',
      description: null,
      departmentRef: '/Engineering',
      defaultRole: 'manager',
      isDefault: false,
      items: [],
    });
    const prisma = { onboardingTemplate: { findUnique } } as unknown as PrismaClient;

    const template = await new PrismaTemplateRepository(prisma).findById('t1');

    expect(findUnique).toHaveBeenCalledWith({
      where: { id: 't1' },
      include: { items: { orderBy: { position: 'asc' } } },
    });
    expect(template).toMatchObject({
      id: 't1',
      departmentRef: '/Engineering',
      defaultRole: 'manager',
    });
  });

  it('returns null for a template that does not exist', async () => {
    const prisma = {
      onboardingTemplate: { findUnique: vi.fn().mockResolvedValue(null) },
    } as unknown as PrismaClient;

    expect(await new PrismaTemplateRepository(prisma).findById('missing')).toBeNull();
  });

  describe('findDefault', () => {
    const stored = {
      id: 'g1',
      name: 'General onboarding',
      description: null,
      departmentRef: null,
      defaultRole: null,
      isDefault: true,
      items: [
        {
          id: 'gi1',
          templateId: 'g1',
          title: 'Hand over laptop',
          description: null,
          kind: 'MANUAL_TASK',
          targetRef: null,
          position: 0,
        },
      ],
    };

    it('asks for the oldest flagged template, then the lowest id, with items in position order', async () => {
      const findFirst = vi.fn().mockResolvedValue(stored);
      const prisma = { onboardingTemplate: { findFirst } } as unknown as PrismaClient;

      const template = await new PrismaTemplateRepository(prisma).findDefault();

      expect(findFirst).toHaveBeenCalledWith({
        where: { isDefault: true },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        include: { items: { orderBy: { position: 'asc' } } },
      });
      expect(template).toEqual({
        id: 'g1',
        name: 'General onboarding',
        description: null,
        departmentRef: null,
        defaultRole: null,
        isDefault: true,
        items: [
          {
            id: 'gi1',
            title: 'Hand over laptop',
            description: null,
            kind: 'MANUAL_TASK',
            targetRef: null,
            position: 0,
          },
        ],
      });
    });

    it('returns null when no template is flagged', async () => {
      const prisma = {
        onboardingTemplate: { findFirst: vi.fn().mockResolvedValue(null) },
      } as unknown as PrismaClient;

      expect(await new PrismaTemplateRepository(prisma).findDefault()).toBeNull();
    });
  });

  it('ignores a stored default role that is not one of the onboardable roles', async () => {
    const findMany = vi.fn().mockResolvedValue([
      {
        id: 't1',
        name: 'Odd',
        description: null,
        departmentRef: null,
        defaultRole: 'owner',
        isDefault: false,
        items: [],
      },
    ]);
    const prisma = { onboardingTemplate: { findMany } } as unknown as PrismaClient;

    const [template] = await new PrismaTemplateRepository(prisma).listWithItems();

    expect(template?.defaultRole).toBeNull();
  });
});
