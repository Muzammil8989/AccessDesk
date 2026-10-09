import { randomBytes } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPrisma, type PrismaClient } from '../../src/infra/db';
import type { AuditEntry } from '../../src/modules/audit/audit.repository';
import { PrismaChecklistRepository } from '../../src/modules/checklists/prisma-checklists.repository';

const adminUrl = process.env.TEST_DATABASE_URL;
const MIGRATIONS_DIR = path.resolve(import.meta.dirname, '../../prisma/migrations');
const AT = new Date('2026-10-09T12:00:00.000Z');

const audit = (subjectId: string, itemId: string, action: string): AuditEntry => ({
  actorId: 'admin-1',
  action,
  outcome: 'SUCCESS',
  targetSubjectId: subjectId,
  requestId: 'req-1',
  details: { itemId },
});

describe.skipIf(!adminUrl)('PrismaChecklistRepository on a real database', () => {
  const dbName = `accessdesk_test_${randomBytes(4).toString('hex')}`;
  let admin: pg.Client;
  let db: pg.Client;
  let prisma: PrismaClient;
  let repo: PrismaChecklistRepository;
  let counter = 0;
  const subject = () => `00000000-0000-4000-8000-${String((counter += 1)).padStart(12, '0')}`;

  beforeAll(async () => {
    admin = new pg.Client({ connectionString: adminUrl });
    await admin.connect();
    await admin.query(`CREATE DATABASE ${dbName}`);
    const url = new URL(adminUrl!);
    url.pathname = `/${dbName}`;
    db = new pg.Client({ connectionString: url.toString() });
    await db.connect();
    const names = readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
    for (const name of names) {
      await db.query(readFileSync(path.join(MIGRATIONS_DIR, name, 'migration.sql'), 'utf8'));
    }
    prisma = createPrisma(url.toString());
    repo = new PrismaChecklistRepository(prisma);
  }, 60_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await db?.end();
    if (admin) {
      await admin.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
      await admin.end();
    }
  }, 60_000);

  const newChecklist = (subjectId: string, titles: string[]) => ({
    subjectId,
    templateId: null,
    createdBy: 'admin-1',
    at: AT,
    tasks: titles.map((title) => ({ title, description: null })),
  });

  async function seeded(titles = ['Order laptop', 'Security training']) {
    const subjectId = subject();
    await repo.create(newChecklist(subjectId, titles));
    const checklist = (await repo.find(subjectId))!;
    return { subjectId, checklist, ids: checklist.items.map((item) => item.id) };
  }

  const auditRows = async (subjectId: string) =>
    (
      await db.query(`SELECT action, actor_id FROM app_audit_log WHERE target_subject_id = $1`, [
        subjectId,
      ])
    ).rows;

  describe('create, find, list', () => {
    it('creates the checklist with its tasks in order and finds it again', async () => {
      const { checklist } = await seeded(['A', 'B', 'C']);

      expect(checklist).toMatchObject({
        status: 'open',
        completedAt: null,
        templateName: null,
        items: [
          { title: 'A', position: 0, status: 'pending' },
          { title: 'B', position: 1, status: 'pending' },
          { title: 'C', position: 2, status: 'pending' },
        ],
      });
    });

    it('creates one checklist however often, and however many times at once, it is asked', async () => {
      const subjectId = subject();

      await Promise.all([
        repo.create(newChecklist(subjectId, ['A'])),
        repo.create(newChecklist(subjectId, ['A'])),
        repo.create(newChecklist(subjectId, ['A'])),
      ]);
      await repo.create(newChecklist(subjectId, ['A']));

      const { rows } = await db.query(
        `SELECT count(*)::int AS n FROM employee_checklists WHERE subject_id = $1`,
        [subjectId],
      );
      expect(rows[0].n).toBe(1);
      expect(await repo.exists(subjectId)).toBe(true);
      expect(await repo.exists(subject())).toBe(false);
    });

    it('creates a checklist with no tasks as already done', async () => {
      const subjectId = subject();

      await repo.create(newChecklist(subjectId, []));

      expect(await repo.find(subjectId)).toMatchObject({
        status: 'done',
        completedAt: AT,
        items: [],
      });
    });

    it('lists open and done checklists with their counts, newest first, and pages them', async () => {
      const a = await seeded(['A', 'B']);
      const b = await seeded(['A']);
      const emptyId = subject();
      await repo.create(newChecklist(emptyId, []));
      await repo.setItemDone({
        subjectId: a.subjectId,
        itemId: a.ids[0]!,
        done: true,
        actorId: 'admin-1',
        at: AT,
        audit: audit(a.subjectId, a.ids[0]!, 'checklist.item_done'),
      });

      const open = await repo.list({ status: 'open', first: 0, max: 20 });
      const done = await repo.list({ status: 'done', first: 0, max: 20 });
      const page = await repo.list({ status: 'open', first: 0, max: 1 });

      const find = (list: typeof open, id: string) => list.items.find((i) => i.subjectId === id);
      expect(find(open, a.subjectId)).toMatchObject({ totalCount: 2, doneCount: 1 });
      expect(find(open, b.subjectId)).toMatchObject({ totalCount: 1, doneCount: 0 });
      expect(find(done, emptyId)).toMatchObject({ totalCount: 0, status: 'done' });
      expect(find(done, a.subjectId)).toBeUndefined();
      expect(page.items).toHaveLength(1);
      expect(page.total).toBe(open.total);
    });

    it('answers null for a subject that has no checklist', async () => {
      expect(await repo.find(subject())).toBeNull();
    });
  });

  describe('setItemDone', () => {
    it('ticks a task, completes the checklist with the last one and writes the audit rows', async () => {
      const { subjectId, ids } = await seeded();
      const tick = (index: number, done: boolean) =>
        repo.setItemDone({
          subjectId,
          itemId: ids[index]!,
          done,
          actorId: 'admin-7',
          at: AT,
          audit: audit(
            subjectId,
            ids[index]!,
            done ? 'checklist.item_done' : 'checklist.item_undone',
          ),
        });

      const first = await tick(0, true);
      const second = await tick(1, true);
      const reopened = await tick(0, false);

      expect(first).toMatchObject({ status: 'open', completedAt: null });
      expect(first?.items[0]).toMatchObject({ status: 'done', completedAt: AT });
      expect(second).toMatchObject({ status: 'done', completedAt: AT });
      expect(reopened).toMatchObject({ status: 'open', completedAt: null });
      expect(reopened?.items[0]).toMatchObject({ status: 'pending', completedAt: null });
      expect((await auditRows(subjectId)).map((row) => row.action)).toEqual([
        'checklist.item_done',
        'checklist.item_done',
        'checklist.item_undone',
      ]);
      const { rows } = await db.query(`SELECT completed_by FROM checklist_items WHERE id = $1`, [
        ids[1],
      ]);
      expect(rows[0].completed_by).toBe('admin-7');
    });

    it('rolls the tick back when the audit row cannot be written: item and checklist unchanged', async () => {
      const { subjectId, ids } = await seeded(['Only task']);
      await db.query(`
        CREATE OR REPLACE FUNCTION test_refuse_ticks() RETURNS trigger AS $$
        BEGIN
          IF NEW.action = 'checklist.item_done' THEN RAISE EXCEPTION 'audit insert refused'; END IF;
          RETURN NEW;
        END $$ LANGUAGE plpgsql`);
      await db.query(
        `CREATE TRIGGER test_refuse_ticks BEFORE INSERT ON app_audit_log
         FOR EACH ROW EXECUTE FUNCTION test_refuse_ticks()`,
      );

      try {
        await expect(
          repo.setItemDone({
            subjectId,
            itemId: ids[0]!,
            done: true,
            actorId: 'admin-1',
            at: AT,
            audit: audit(subjectId, ids[0]!, 'checklist.item_done'),
          }),
        ).rejects.toThrow();
      } finally {
        await db.query(`DROP TRIGGER test_refuse_ticks ON app_audit_log`);
      }

      expect(await repo.find(subjectId)).toMatchObject({
        status: 'open',
        completedAt: null,
        items: [{ status: 'pending', completedAt: null }],
      });
      const { rows } = await db.query(`SELECT completed_by FROM checklist_items WHERE id = $1`, [
        ids[0],
      ]);
      expect(rows[0].completed_by).toBeNull();
      expect(await auditRows(subjectId)).toEqual([]);
    });

    it('still completes the checklist when two different tasks are ticked at the same moment', async () => {
      const { subjectId, ids } = await seeded();
      const tick = (index: number) =>
        repo.setItemDone({
          subjectId,
          itemId: ids[index]!,
          done: true,
          actorId: 'admin-1',
          at: AT,
          audit: audit(subjectId, ids[index]!, 'checklist.item_done'),
        });

      await Promise.all([tick(0), tick(1)]);

      expect(await repo.find(subjectId)).toMatchObject({
        status: 'done',
        completedAt: AT,
        items: [{ status: 'done' }, { status: 'done' }],
      });
      expect(await auditRows(subjectId)).toHaveLength(2);
    });

    it('answers null, changing and writing nothing, for a task of another checklist or an unknown subject', async () => {
      const mine = await seeded();
      const theirs = await seeded(['Theirs']);

      const foreign = await repo.setItemDone({
        subjectId: mine.subjectId,
        itemId: theirs.ids[0]!,
        done: true,
        actorId: 'admin-1',
        at: AT,
        audit: audit(mine.subjectId, theirs.ids[0]!, 'checklist.item_done'),
      });
      const unknown = await repo.setItemDone({
        subjectId: subject(),
        itemId: mine.ids[0]!,
        done: true,
        actorId: 'admin-1',
        at: AT,
        audit: audit(mine.subjectId, mine.ids[0]!, 'checklist.item_done'),
      });

      expect(foreign).toBeNull();
      expect(unknown).toBeNull();
      expect((await repo.find(theirs.subjectId))?.items[0]?.status).toBe('pending');
      expect(await auditRows(mine.subjectId)).toEqual([]);
    });
  });

  it('has no column that could hold a name, a username or an email', async () => {
    const { rows } = await db.query(
      `SELECT table_name, column_name FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name IN ('employee_checklists', 'checklist_items')
         AND column_name ~* '(email|user_?name|first|last|display|full)'`,
    );
    expect(rows).toEqual([]);
  });
});
