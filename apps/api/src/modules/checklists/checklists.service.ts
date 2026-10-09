import type { IdentityProvider } from '@accessdesk/identity';
import type { ChecklistDetail, ChecklistList, ListChecklistsQuery } from '@accessdesk/shared';
import type { AuditEntry } from '../audit/audit.repository';
import { checklistErrors } from './checklists.errors';
import type { ChecklistRepository, StoredChecklist } from './checklists.repository';
import { lookupPeople } from './live-people';

export interface ChecklistsServiceDeps {
  checklists: ChecklistRepository;
  identity: Pick<IdentityProvider, 'getUser'>;
  clock: () => Date;
}

export interface ChecklistCaller {
  actorId: string;
  requestId: string;
}

export const CHECKLIST_AUDIT_ACTIONS = {
  done: 'checklist.item_done',
  undone: 'checklist.item_undone',
} as const;

export class ChecklistsService {
  constructor(private readonly deps: ChecklistsServiceDeps) {}

  async list(query: ListChecklistsQuery): Promise<ChecklistList> {
    const { items, total } = await this.deps.checklists.list(query);
    const people = await lookupPeople(
      this.deps.identity,
      items.map((item) => item.subjectId),
    );
    return {
      total,
      first: query.first,
      max: query.max,
      items: items.map((item) => ({
        subjectId: item.subjectId,
        status: item.status,
        createdAt: item.createdAt.toISOString(),
        completedAt: item.completedAt?.toISOString() ?? null,
        totalCount: item.totalCount,
        doneCount: item.doneCount,
        person: people.get(item.subjectId) ?? null,
      })),
    };
  }

  async get(subjectId: string): Promise<ChecklistDetail> {
    const checklist = await this.deps.checklists.find(subjectId);
    if (!checklist) throw checklistErrors.notFound();
    return this.detail(checklist);
  }

  async setItem(
    subjectId: string,
    itemId: string,
    done: boolean,
    caller: ChecklistCaller,
  ): Promise<ChecklistDetail> {
    const audit: AuditEntry = {
      actorId: caller.actorId,
      action: done ? CHECKLIST_AUDIT_ACTIONS.done : CHECKLIST_AUDIT_ACTIONS.undone,
      outcome: 'SUCCESS',
      targetSubjectId: subjectId,
      requestId: caller.requestId,
      details: { itemId },
    };
    const updated = await this.deps.checklists.setItemDone({
      subjectId,
      itemId,
      done,
      actorId: caller.actorId,
      at: this.deps.clock(),
      audit,
    });
    if (!updated) {
      const exists = await this.deps.checklists.exists(subjectId);
      throw exists ? checklistErrors.itemNotFound() : checklistErrors.notFound();
    }
    return this.detail(updated);
  }

  private async detail(checklist: StoredChecklist): Promise<ChecklistDetail> {
    const people = await lookupPeople(this.deps.identity, [checklist.subjectId]);
    return {
      subjectId: checklist.subjectId,
      status: checklist.status,
      createdAt: checklist.createdAt.toISOString(),
      completedAt: checklist.completedAt?.toISOString() ?? null,
      templateName: checklist.templateName,
      person: people.get(checklist.subjectId) ?? null,
      items: checklist.items.map((item) => ({
        id: item.id,
        title: item.title,
        description: item.description,
        status: item.status,
        position: item.position,
        completedAt: item.completedAt?.toISOString() ?? null,
      })),
    };
  }
}
