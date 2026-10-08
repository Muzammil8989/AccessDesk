import type { PrismaClient } from '../../infra/db';
import type { AuditEntry, AuditRepository, SuccessLookup } from './audit.repository';

export class PrismaAuditRepository implements AuditRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async record(entry: AuditEntry): Promise<void> {
    await this.prisma.appAuditLog.create({
      data: {
        actorId: entry.actorId,
        action: entry.action,
        outcome: entry.outcome,
        targetSubjectId: entry.targetSubjectId,
        requestId: entry.requestId,
        details: entry.details,
      },
    });
  }

  async hasSuccessSince(lookup: SuccessLookup): Promise<boolean> {
    const row = await this.prisma.appAuditLog.findFirst({
      where: {
        action: lookup.action,
        actorId: lookup.actorId,
        targetSubjectId: lookup.targetSubjectId,
        outcome: 'SUCCESS',
        createdAt: { gte: lookup.since },
      },
      select: { id: true },
    });
    return row !== null;
  }
}
