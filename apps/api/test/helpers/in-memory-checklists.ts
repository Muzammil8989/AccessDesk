import type { ListChecklistsQuery } from '@accessdesk/shared';
import type { AuditWriter } from '../../src/modules/audit/audit.repository';
import type {
  ChecklistRepository,
  ItemChange,
  NewChecklist,
  StoredChecklist,
  StoredChecklistItem,
  StoredChecklistSummary,
} from '../../src/modules/checklists/checklists.repository';

export interface StoredRow {
  id: string;
  subjectId: string;
  templateId: string | null;
  createdBy: string;
  createdAt: Date;
  completedAt: Date | null;
  status: 'open' | 'done' | 'cancelled';
  items: (StoredChecklistItem & { completedBy: string | null })[];
}

let counter = 0;
export const nextId = (): string =>
  `00000000-0000-4000-8000-${String((counter += 1)).padStart(12, '0')}`;

export class InMemoryChecklistRepository implements ChecklistRepository {
  readonly rows: StoredRow[] = [];
  failCreate = false;

  constructor(
    private readonly audit: AuditWriter,
    private readonly templateNames: Record<string, string> = {},
  ) {}

  seed(
    subjectId: string,
    titles: string[],
    options: { createdAt?: Date; status?: StoredRow['status'] } = {},
  ): StoredRow {
    const row: StoredRow = {
      id: nextId(),
      subjectId,
      templateId: null,
      createdBy: 'admin-1',
      createdAt: options.createdAt ?? new Date('2026-10-09T09:00:00.000Z'),
      completedAt: null,
      status: options.status ?? 'open',
      items: titles.map((title, position) => ({
        id: nextId(),
        title,
        description: null,
        status: options.status === 'done' ? 'done' : 'pending',
        position,
        completedAt: null,
        completedBy: null,
      })),
    };
    this.rows.push(row);
    return row;
  }

  async create(checklist: NewChecklist): Promise<void> {
    if (this.failCreate) throw new Error('checklist store unavailable');
    if (this.rows.some((row) => row.subjectId === checklist.subjectId)) return;
    const empty = checklist.tasks.length === 0;
    this.rows.push({
      id: nextId(),
      subjectId: checklist.subjectId,
      templateId: checklist.templateId,
      createdBy: checklist.createdBy,
      createdAt: checklist.at,
      completedAt: empty ? checklist.at : null,
      status: empty ? 'done' : 'open',
      items: checklist.tasks.map((task, position) => ({
        id: nextId(),
        title: task.title,
        description: task.description,
        status: 'pending',
        position,
        completedAt: null,
        completedBy: null,
      })),
    });
  }

  async exists(subjectId: string): Promise<boolean> {
    return this.rows.some((row) => row.subjectId === subjectId);
  }

  async list(query: ListChecklistsQuery) {
    const wanted = query.status === 'open' ? 'open' : 'done';
    const matching = this.rows
      .filter((row) => row.status === wanted)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || a.id.localeCompare(b.id));
    const items: StoredChecklistSummary[] = matching
      .slice(query.first, query.first + query.max)
      .map((row) => ({
        subjectId: row.subjectId,
        status: row.status,
        createdAt: row.createdAt,
        completedAt: row.completedAt,
        totalCount: row.items.length,
        doneCount: row.items.filter((item) => item.status === 'done').length,
      }));
    return { items, total: matching.length };
  }

  async find(subjectId: string): Promise<StoredChecklist | null> {
    const row = this.rows.find((candidate) => candidate.subjectId === subjectId);
    return row ? this.toStored(row) : null;
  }

  async setItemDone(change: ItemChange): Promise<StoredChecklist | null> {
    const row = this.rows.find((candidate) => candidate.subjectId === change.subjectId);
    const item = row?.items.find((candidate) => candidate.id === change.itemId);
    if (!row || !item) return null;

    // Like the real transaction: the audit row is written first, and if it fails nothing changes.
    await this.audit.record(change.audit);

    item.status = change.done ? 'done' : 'pending';
    item.completedAt = change.done ? change.at : null;
    item.completedBy = change.done ? change.actorId : null;
    const finished = row.items.every((candidate) => candidate.status === 'done');
    row.status = finished ? 'done' : 'open';
    row.completedAt = finished ? change.at : null;
    return this.toStored(row);
  }

  private toStored(row: StoredRow): StoredChecklist {
    return {
      subjectId: row.subjectId,
      status: row.status,
      createdAt: row.createdAt,
      completedAt: row.completedAt,
      templateName: row.templateId ? (this.templateNames[row.templateId] ?? null) : null,
      items: row.items.map(({ completedBy: _completedBy, ...item }) => ({ ...item })),
    };
  }
}
