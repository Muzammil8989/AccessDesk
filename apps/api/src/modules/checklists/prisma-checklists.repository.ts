import type { ListChecklistsQuery } from '@accessdesk/shared';
import type { PrismaClient } from '../../infra/db';
import type { ChecklistItemStatus, ChecklistStatus, Prisma } from '../../generated/prisma/client';
import { toAuditData } from '../audit/prisma-audit.repository';
import type {
  ChecklistRepository,
  ItemChange,
  NewChecklist,
  StoredChecklist,
  StoredChecklistStatus,
  StoredChecklistSummary,
  StoredItemStatus,
} from './checklists.repository';

const ONBOARDING = 'ONBOARDING';
const UNIQUE_VIOLATION = 'P2002';

const CHECKLIST_STATUS: Record<ChecklistStatus, StoredChecklistStatus> = {
  OPEN: 'open',
  COMPLETED: 'done',
  CANCELLED: 'cancelled',
};

const ITEM_STATUS: Record<ChecklistItemStatus, StoredItemStatus> = {
  PENDING: 'pending',
  DONE: 'done',
  SKIPPED: 'skipped',
  FAILED: 'failed',
};

const WITH_ITEMS = {
  template: { select: { name: true } },
  items: { orderBy: { position: 'asc' } },
} as const;

type Row = Prisma.EmployeeChecklistGetPayload<{ include: typeof WITH_ITEMS }>;

function toStored(row: Row): StoredChecklist {
  return {
    subjectId: row.subjectId,
    status: CHECKLIST_STATUS[row.status],
    createdAt: row.createdAt,
    completedAt: row.completedAt,
    templateName: row.template?.name ?? null,
    items: row.items.map((item) => ({
      id: item.id,
      title: item.title,
      description: item.description,
      status: ITEM_STATUS[item.status],
      position: item.position,
      completedAt: item.completedAt,
    })),
  };
}

const isUniqueViolation = (error: unknown): boolean =>
  typeof error === 'object' && error !== null && 'code' in error && error.code === UNIQUE_VIOLATION;

export class PrismaChecklistRepository implements ChecklistRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(checklist: NewChecklist): Promise<void> {
    const empty = checklist.tasks.length === 0;
    try {
      await this.prisma.employeeChecklist.create({
        data: {
          subjectId: checklist.subjectId,
          templateId: checklist.templateId,
          type: ONBOARDING,
          status: empty ? 'COMPLETED' : 'OPEN',
          completedAt: empty ? checklist.at : null,
          createdBy: checklist.createdBy,
          createdAt: checklist.at,
          items: {
            create: checklist.tasks.map((task, position) => ({
              title: task.title,
              description: task.description,
              kind: 'MANUAL_TASK' as const,
              position,
            })),
          },
        },
      });
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
    }
  }

  async exists(subjectId: string): Promise<boolean> {
    const count = await this.prisma.employeeChecklist.count({
      where: { subjectId, type: ONBOARDING },
    });
    return count > 0;
  }

  async list(
    query: ListChecklistsQuery,
  ): Promise<{ items: StoredChecklistSummary[]; total: number }> {
    const where = {
      type: ONBOARDING,
      status: query.status === 'open' ? 'OPEN' : 'COMPLETED',
    } as const;
    const [rows, total] = await Promise.all([
      this.prisma.employeeChecklist.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: query.first,
        take: query.max,
        include: { items: { select: { status: true } } },
      }),
      this.prisma.employeeChecklist.count({ where }),
    ]);
    return {
      total,
      items: rows.map((row) => ({
        subjectId: row.subjectId,
        status: CHECKLIST_STATUS[row.status],
        createdAt: row.createdAt,
        completedAt: row.completedAt,
        totalCount: row.items.length,
        doneCount: row.items.filter((item) => item.status === 'DONE').length,
      })),
    };
  }

  async find(subjectId: string): Promise<StoredChecklist | null> {
    const row = await this.prisma.employeeChecklist.findUnique({
      where: { subjectId_type: { subjectId, type: ONBOARDING } },
      include: WITH_ITEMS,
    });
    return row ? toStored(row) : null;
  }

  async setItemDone(change: ItemChange): Promise<StoredChecklist | null> {
    return this.prisma.$transaction(async (tx) => {
      const checklist = await tx.employeeChecklist.findUnique({
        where: { subjectId_type: { subjectId: change.subjectId, type: ONBOARDING } },
        select: { id: true },
      });
      if (!checklist) return null;

      await tx.$queryRaw`SELECT id FROM employee_checklists WHERE id = ${checklist.id}::uuid FOR UPDATE`;

      const item = await tx.checklistItem.findFirst({
        where: { id: change.itemId, checklistId: checklist.id, kind: 'MANUAL_TASK' },
        select: { id: true },
      });
      if (!item) return null;

      await tx.checklistItem.update({
        where: { id: item.id },
        data: change.done
          ? { status: 'DONE', completedAt: change.at, completedBy: change.actorId }
          : { status: 'PENDING', completedAt: null, completedBy: null },
      });
      const remaining = await tx.checklistItem.count({
        where: { checklistId: checklist.id, status: { not: 'DONE' } },
      });
      await tx.employeeChecklist.update({
        where: { id: checklist.id },
        data:
          remaining === 0
            ? { status: 'COMPLETED', completedAt: change.at }
            : { status: 'OPEN', completedAt: null },
      });
      await tx.appAuditLog.create({ data: toAuditData(change.audit) });

      const updated = await tx.employeeChecklist.findUniqueOrThrow({
        where: { id: checklist.id },
        include: WITH_ITEMS,
      });
      return toStored(updated);
    });
  }
}
