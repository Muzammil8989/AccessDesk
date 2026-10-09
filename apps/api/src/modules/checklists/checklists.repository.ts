import type { ListChecklistsQuery } from '@accessdesk/shared';
import type { AuditEntry } from '../audit/audit.repository';

export type StoredChecklistStatus = 'open' | 'done' | 'cancelled';
export type StoredItemStatus = 'pending' | 'done' | 'skipped' | 'failed';

export interface StoredChecklistItem {
  id: string;
  title: string;
  description: string | null;
  status: StoredItemStatus;
  position: number;
  completedAt: Date | null;
}

export interface StoredChecklist {
  subjectId: string;
  status: StoredChecklistStatus;
  createdAt: Date;
  completedAt: Date | null;
  templateName: string | null;
  items: StoredChecklistItem[];
}

export interface StoredChecklistSummary {
  subjectId: string;
  status: StoredChecklistStatus;
  createdAt: Date;
  completedAt: Date | null;
  totalCount: number;
  doneCount: number;
}

export interface NewChecklist {
  subjectId: string;
  templateId: string | null;
  createdBy: string;
  at: Date;
  tasks: { title: string; description: string | null }[];
}

export interface ItemChange {
  subjectId: string;
  itemId: string;
  done: boolean;
  actorId: string;
  at: Date;
  audit: AuditEntry;
}

export interface ChecklistRepository {
  /** Creates the onboarding checklist for a subject. Does nothing if one exists. */
  create(checklist: NewChecklist): Promise<void>;
  exists(subjectId: string): Promise<boolean>;
  list(query: ListChecklistsQuery): Promise<{ items: StoredChecklistSummary[]; total: number }>;
  find(subjectId: string): Promise<StoredChecklist | null>;
  /**
   * Ticks or unticks one task and writes `audit` in the same transaction, so neither exists without
   * the other. Returns null when the checklist or the task does not exist.
   */
  setItemDone(change: ItemChange): Promise<StoredChecklist | null>;
}
