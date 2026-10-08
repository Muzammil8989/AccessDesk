export type AuditOutcome = 'SUCCESS' | 'FAILURE';

export interface AuditEntry {
  actorId: string;
  action: string;
  outcome: AuditOutcome;
  targetSubjectId?: string;
  requestId?: string;
  details?: Record<string, string>;
}

export interface SuccessLookup {
  action: string;
  actorId: string;
  targetSubjectId: string;
  since: Date;
}

export interface AuditWriter {
  record(entry: AuditEntry): Promise<void>;
}

export interface AuditReader {
  hasSuccessSince(lookup: SuccessLookup): Promise<boolean>;
}

export interface AuditRepository extends AuditWriter, AuditReader {}
