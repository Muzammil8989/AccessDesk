import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '../../src/infra/db';
import { PrismaChecklistRepository } from '../../src/modules/checklists/prisma-checklists.repository';

const AT = new Date('2026-10-09T12:00:00.000Z');

function fakePrisma() {
  const tx = {
    employeeChecklist: {
      findUnique: vi.fn(),
      update: vi.fn().mockResolvedValue({}),
      findUniqueOrThrow: vi.fn(),
    },
    checklistItem: {
      findFirst: vi.fn(),
      update: vi.fn().mockResolvedValue({}),
      count: vi.fn(),
    },
    appAuditLog: { create: vi.fn().mockResolvedValue({}) },
    $queryRaw: vi.fn().mockResolvedValue([]),
  };
  const prisma = {
    employeeChecklist: {
      create: vi.fn().mockResolvedValue({}),
      count: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
    $transaction: vi.fn(async (work: (client: typeof tx) => unknown) => work(tx)),
  };
  return { prisma: prisma as unknown as PrismaClient, mocks: prisma, tx };
}

const row = (overrides: Record<string, unknown> = {}) => ({
  id: 'c1',
  subjectId: 's1',
  status: 'OPEN',
  createdAt: AT,
  completedAt: null,
  template: { name: 'Developer' },
  items: [
    {
      id: 'i1',
      title: 'Order laptop',
      description: null,
      status: 'DONE',
      position: 0,
      completedAt: AT,
    },
    {
      id: 'i2',
      title: 'Training',
      description: 'Online',
      status: 'PENDING',
      position: 1,
      completedAt: null,
    },
  ],
  ...overrides,
});

const change = {
  subjectId: 's1',
  itemId: 'i1',
  done: true,
  actorId: 'admin-1',
  at: AT,
  audit: {
    actorId: 'admin-1',
    action: 'checklist.item_done',
    outcome: 'SUCCESS' as const,
    targetSubjectId: 's1',
    requestId: 'r1',
    details: { itemId: 'i1' },
  },
};

describe('PrismaChecklistRepository (against a mocked client)', () => {
  describe('create', () => {
    it('saves an open onboarding checklist with its tasks in order', async () => {
      const { prisma, mocks } = fakePrisma();

      await new PrismaChecklistRepository(prisma).create({
        subjectId: 's1',
        templateId: 't1',
        createdBy: 'admin-1',
        at: AT,
        tasks: [
          { title: 'A', description: null },
          { title: 'B', description: 'later' },
        ],
      });

      expect(mocks.employeeChecklist.create).toHaveBeenCalledWith({
        data: {
          subjectId: 's1',
          templateId: 't1',
          type: 'ONBOARDING',
          status: 'OPEN',
          completedAt: null,
          createdBy: 'admin-1',
          createdAt: AT,
          items: {
            create: [
              { title: 'A', description: null, kind: 'MANUAL_TASK', position: 0 },
              { title: 'B', description: 'later', kind: 'MANUAL_TASK', position: 1 },
            ],
          },
        },
      });
    });

    it('saves a checklist with no tasks as already completed', async () => {
      const { prisma, mocks } = fakePrisma();

      await new PrismaChecklistRepository(prisma).create({
        subjectId: 's1',
        templateId: null,
        createdBy: 'admin-1',
        at: AT,
        tasks: [],
      });

      expect(mocks.employeeChecklist.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ status: 'COMPLETED', completedAt: AT }),
      });
    });

    it('treats a unique violation as "already there", and passes any other error on', async () => {
      const { prisma, mocks } = fakePrisma();
      const repo = new PrismaChecklistRepository(prisma);
      const input = { subjectId: 's1', templateId: null, createdBy: 'a', at: AT, tasks: [] };

      mocks.employeeChecklist.create.mockRejectedValueOnce(
        Object.assign(new Error('unique'), { code: 'P2002' }),
      );
      await expect(repo.create(input)).resolves.toBeUndefined();

      mocks.employeeChecklist.create.mockRejectedValueOnce(
        Object.assign(new Error('down'), { code: 'P1001' }),
      );
      await expect(repo.create(input)).rejects.toThrow('down');
      mocks.employeeChecklist.create.mockRejectedValueOnce('plain string');
      await expect(repo.create(input)).rejects.toBe('plain string');
      mocks.employeeChecklist.create.mockRejectedValueOnce(null);
      await expect(repo.create(input)).rejects.toBeNull();
    });
  });

  it('says whether a subject has an onboarding checklist', async () => {
    const { prisma, mocks } = fakePrisma();
    mocks.employeeChecklist.count.mockResolvedValueOnce(1).mockResolvedValueOnce(0);
    const repo = new PrismaChecklistRepository(prisma);

    expect(await repo.exists('s1')).toBe(true);
    expect(await repo.exists('s2')).toBe(false);
    expect(mocks.employeeChecklist.count).toHaveBeenCalledWith({
      where: { subjectId: 's1', type: 'ONBOARDING' },
    });
  });

  describe('list', () => {
    it.each([
      ['open', 'OPEN'],
      ['done', 'COMPLETED'],
    ] as const)(
      'asks for the %s onboarding checklists, newest first, one page',
      async (status, stored) => {
        const { prisma, mocks } = fakePrisma();
        mocks.employeeChecklist.findMany.mockResolvedValue([row({ status: stored })]);
        mocks.employeeChecklist.count.mockResolvedValue(41);

        const result = await new PrismaChecklistRepository(prisma).list({
          status,
          first: 20,
          max: 20,
        });

        expect(mocks.employeeChecklist.findMany).toHaveBeenCalledWith({
          where: { type: 'ONBOARDING', status: stored },
          orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
          skip: 20,
          take: 20,
          include: { items: { select: { status: true } } },
        });
        expect(result.total).toBe(41);
        expect(result.items).toEqual([
          {
            subjectId: 's1',
            status,
            createdAt: AT,
            completedAt: null,
            totalCount: 2,
            doneCount: 1,
          },
        ]);
      },
    );
  });

  describe('find', () => {
    it('maps the stored row to the neutral shape, with the template name and task statuses', async () => {
      const { prisma, mocks } = fakePrisma();
      mocks.employeeChecklist.findUnique.mockResolvedValue(row());

      const found = await new PrismaChecklistRepository(prisma).find('s1');

      expect(mocks.employeeChecklist.findUnique).toHaveBeenCalledWith({
        where: { subjectId_type: { subjectId: 's1', type: 'ONBOARDING' } },
        include: { template: { select: { name: true } }, items: { orderBy: { position: 'asc' } } },
      });
      expect(found).toEqual({
        subjectId: 's1',
        status: 'open',
        createdAt: AT,
        completedAt: null,
        templateName: 'Developer',
        items: [
          {
            id: 'i1',
            title: 'Order laptop',
            description: null,
            status: 'done',
            position: 0,
            completedAt: AT,
          },
          {
            id: 'i2',
            title: 'Training',
            description: 'Online',
            status: 'pending',
            position: 1,
            completedAt: null,
          },
        ],
      });
    });

    it('has no template name when the template was deleted, and null when there is no checklist', async () => {
      const { prisma, mocks } = fakePrisma();
      mocks.employeeChecklist.findUnique
        .mockResolvedValueOnce(row({ template: null, status: 'COMPLETED' }))
        .mockResolvedValueOnce(null);
      const repo = new PrismaChecklistRepository(prisma);

      expect(await repo.find('s1')).toMatchObject({ templateName: null, status: 'done' });
      expect(await repo.find('s2')).toBeNull();
    });
  });

  describe('setItemDone', () => {
    function armed(remaining: number) {
      const fake = fakePrisma();
      fake.tx.employeeChecklist.findUnique.mockResolvedValue({ id: 'c1' });
      fake.tx.checklistItem.findFirst.mockResolvedValue({ id: 'i1' });
      fake.tx.checklistItem.count.mockResolvedValue(remaining);
      fake.tx.employeeChecklist.findUniqueOrThrow.mockResolvedValue(row());
      return fake;
    }

    it('ticks the task, completes the checklist when nothing is left, and writes the audit row in the same transaction', async () => {
      const { prisma, mocks, tx } = armed(0);

      const result = await new PrismaChecklistRepository(prisma).setItemDone(change);

      expect(mocks.$transaction).toHaveBeenCalledTimes(1);
      expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
      expect(tx.checklistItem.update).toHaveBeenCalledWith({
        where: { id: 'i1' },
        data: { status: 'DONE', completedAt: AT, completedBy: 'admin-1' },
      });
      expect(tx.employeeChecklist.update).toHaveBeenCalledWith({
        where: { id: 'c1' },
        data: { status: 'COMPLETED', completedAt: AT },
      });
      expect(tx.appAuditLog.create).toHaveBeenCalledWith({
        data: {
          actorId: 'admin-1',
          action: 'checklist.item_done',
          outcome: 'SUCCESS',
          targetSubjectId: 's1',
          requestId: 'r1',
          details: { itemId: 'i1' },
        },
      });
      expect(result?.subjectId).toBe('s1');
    });

    it('unticks a task and keeps the checklist open while tasks remain', async () => {
      const { prisma, tx } = armed(1);

      await new PrismaChecklistRepository(prisma).setItemDone({ ...change, done: false });

      expect(tx.checklistItem.update).toHaveBeenCalledWith({
        where: { id: 'i1' },
        data: { status: 'PENDING', completedAt: null, completedBy: null },
      });
      expect(tx.employeeChecklist.update).toHaveBeenCalledWith({
        where: { id: 'c1' },
        data: { status: 'OPEN', completedAt: null },
      });
    });

    it('answers null and writes nothing when the checklist does not exist', async () => {
      const { prisma, tx } = armed(0);
      tx.employeeChecklist.findUnique.mockResolvedValue(null);

      expect(await new PrismaChecklistRepository(prisma).setItemDone(change)).toBeNull();
      expect(tx.checklistItem.update).not.toHaveBeenCalled();
      expect(tx.appAuditLog.create).not.toHaveBeenCalled();
    });

    it('answers null and writes nothing when the task is not one of its manual tasks', async () => {
      const { prisma, tx } = armed(0);
      tx.checklistItem.findFirst.mockResolvedValue(null);

      expect(await new PrismaChecklistRepository(prisma).setItemDone(change)).toBeNull();
      expect(tx.checklistItem.findFirst).toHaveBeenCalledWith({
        where: { id: 'i1', checklistId: 'c1', kind: 'MANUAL_TASK' },
        select: { id: true },
      });
      expect(tx.appAuditLog.create).not.toHaveBeenCalled();
    });

    it('lets a failing audit write fail the whole call, so the transaction rolls back', async () => {
      const { prisma, tx } = armed(0);
      tx.appAuditLog.create.mockRejectedValue(new Error('audit insert refused'));

      await expect(new PrismaChecklistRepository(prisma).setItemDone(change)).rejects.toThrow(
        'audit insert refused',
      );
    });
  });
});
