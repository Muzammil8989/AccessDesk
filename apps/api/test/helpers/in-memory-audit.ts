import type {
  AuditEntry,
  AuditRepository,
  SuccessLookup,
} from '../../src/modules/audit/audit.repository';

export interface StoredAuditRow extends AuditEntry {
  createdAt: Date;
}

export class InMemoryAuditRepository implements AuditRepository {
  readonly rows: StoredAuditRow[] = [];
  failWrites = false;

  constructor(private readonly clock: () => Date = () => new Date()) {}

  async record(entry: AuditEntry): Promise<void> {
    if (this.failWrites) throw new Error('audit store unavailable');
    this.rows.push({ ...entry, createdAt: this.clock() });
  }

  async hasSuccessSince(lookup: SuccessLookup): Promise<boolean> {
    return this.rows.some(
      (row) =>
        row.action === lookup.action &&
        row.actorId === lookup.actorId &&
        row.targetSubjectId === lookup.targetSubjectId &&
        row.outcome === 'SUCCESS' &&
        row.createdAt >= lookup.since,
    );
  }
}
