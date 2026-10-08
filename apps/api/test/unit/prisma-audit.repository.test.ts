import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '../../src/infra/db';
import { PrismaAuditRepository } from '../../src/modules/audit/prisma-audit.repository';

function repositoryWith(appAuditLog: Record<string, unknown>) {
  return new PrismaAuditRepository({ appAuditLog } as unknown as PrismaClient);
}

describe('PrismaAuditRepository', () => {
  it('inserts one row with exactly the fields of the entry', async () => {
    const create = vi.fn().mockResolvedValue({});

    await repositoryWith({ create }).record({
      actorId: 'admin-1',
      action: 'onboarding.add_to_group',
      outcome: 'FAILURE',
      targetSubjectId: 'subject-1',
      requestId: 'request-1',
      details: { groupId: 'g1', groupName: 'Sales' },
    });

    expect(create).toHaveBeenCalledWith({
      data: {
        actorId: 'admin-1',
        action: 'onboarding.add_to_group',
        outcome: 'FAILURE',
        targetSubjectId: 'subject-1',
        requestId: 'request-1',
        details: { groupId: 'g1', groupName: 'Sales' },
      },
    });
  });

  it('leaves the optional fields out when they are not given', async () => {
    const create = vi.fn().mockResolvedValue({});

    await repositoryWith({ create }).record({
      actorId: 'admin-1',
      action: 'onboarding.create_user',
      outcome: 'SUCCESS',
    });

    expect(create.mock.calls[0]?.[0].data).toEqual({
      actorId: 'admin-1',
      action: 'onboarding.create_user',
      outcome: 'SUCCESS',
      targetSubjectId: undefined,
      requestId: undefined,
      details: undefined,
    });
  });

  it('looks for a success row of the same action, actor and subject since a time', async () => {
    const findFirst = vi.fn().mockResolvedValue({ id: 'row-1' });
    const since = new Date('2026-10-07T10:00:00.000Z');

    const found = await repositoryWith({ findFirst }).hasSuccessSince({
      action: 'onboarding.create_user',
      actorId: 'admin-1',
      targetSubjectId: 'subject-1',
      since,
    });

    expect(found).toBe(true);
    expect(findFirst).toHaveBeenCalledWith({
      where: {
        action: 'onboarding.create_user',
        actorId: 'admin-1',
        targetSubjectId: 'subject-1',
        outcome: 'SUCCESS',
        createdAt: { gte: since },
      },
      select: { id: true },
    });
  });

  it('reports false when there is no such row', async () => {
    const findFirst = vi.fn().mockResolvedValue(null);

    await expect(
      repositoryWith({ findFirst }).hasSuccessSince({
        action: 'a',
        actorId: 'b',
        targetSubjectId: 'c',
        since: new Date(),
      }),
    ).resolves.toBe(false);
  });
});
