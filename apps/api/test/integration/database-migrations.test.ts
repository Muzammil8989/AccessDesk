import { randomBytes } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPrisma, type PrismaClient } from '../../src/infra/db';

const adminUrl = process.env.TEST_DATABASE_URL;

const MIGRATIONS_DIR = path.resolve(import.meta.dirname, '../../prisma/migrations');
const SUBJECT_ID_MIGRATION = '20261007120000_subject_id_and_append_only_audit_log';
const TEMPLATE_DATA_MIGRATION = '20261009100100_move_template_department_out_of_items';
const UNIQUE_VIOLATION = '23505';
const RAISE_EXCEPTION = 'P0001';
const NOT_NULL_VIOLATION = '23502';

const migrationNames = readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

async function applyMigration(client: pg.Client, name: string) {
  await client.query(readFileSync(path.join(MIGRATIONS_DIR, name, 'migration.sql'), 'utf8'));
}

async function errorOf(promise: Promise<unknown>): Promise<{ code?: string; message: string }> {
  try {
    await promise;
  } catch (error) {
    return error as { code?: string; message: string };
  }
  throw new Error('Expected the statement to fail, but it succeeded');
}

async function seedTemplate(
  db: pg.Client,
  name: string,
  items: { kind: string; targetRef: string | null }[],
  columns: { departmentRef?: string; defaultRole?: string } = {},
) {
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO onboarding_templates (id, name, department_ref, default_role, updated_at)
     VALUES (gen_random_uuid(), $1, $2, $3, now()) RETURNING id`,
    [name, columns.departmentRef ?? null, columns.defaultRole ?? null],
  );
  for (const [position, item] of items.entries()) {
    await db.query(
      `INSERT INTO template_items (id, template_id, title, kind, target_ref, position)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5)`,
      [rows[0]!.id, `${name} item ${position}`, item.kind, item.targetRef, position],
    );
  }
}

async function seedTemplatesInTheOldShape(db: pg.Client) {
  await seedTemplate(db, 'Single', [
    { kind: 'GROUP_MEMBERSHIP', targetRef: '/Engineering' },
    { kind: 'ROLE', targetRef: 'developer' },
    { kind: 'MANUAL_TASK', targetRef: null },
  ]);
  await seedTemplate(db, 'SingleWithRole', [{ kind: 'GROUP_MEMBERSHIP', targetRef: '/Sales' }], {
    defaultRole: 'manager',
  });
  await seedTemplate(db, 'Two', [
    { kind: 'GROUP_MEMBERSHIP', targetRef: '/A' },
    { kind: 'GROUP_MEMBERSHIP', targetRef: '/B' },
  ]);
  await seedTemplate(db, 'NoTarget', [{ kind: 'GROUP_MEMBERSHIP', targetRef: null }]);
  await seedTemplate(db, 'Preset', [{ kind: 'GROUP_MEMBERSHIP', targetRef: '/Other' }], {
    departmentRef: '/Sales',
  });
}

describe.skipIf(!adminUrl)('database migrations', () => {
  const dbName = `accessdesk_test_${randomBytes(4).toString('hex')}`;
  let admin: pg.Client;
  let db: pg.Client;
  let dbUrl: string;

  const legacy = { subject: 'legacy-subject-1', admin: 'legacy-admin-1' };
  const LEGACY_CHECKLIST_ID = '00000000-0000-4000-8000-0000000000aa';
  const notices: string[] = [];

  beforeAll(async () => {
    admin = new pg.Client({ connectionString: adminUrl });
    await admin.connect();
    await admin.query(`CREATE DATABASE ${dbName}`);

    const url = new URL(adminUrl!);
    url.pathname = `/${dbName}`;
    dbUrl = url.toString();
    db = new pg.Client({ connectionString: dbUrl });
    await db.connect();

    for (const name of migrationNames.filter((n) => n < SUBJECT_ID_MIGRATION)) {
      await applyMigration(db, name);
    }
    await db.query(
      `INSERT INTO employee_checklists (id, keycloak_user_id, type, created_by)
       VALUES ($3, $1, 'ONBOARDING', $2)`,
      [legacy.subject, legacy.admin, LEGACY_CHECKLIST_ID],
    );
    await db.query(
      `INSERT INTO scheduled_actions (id, keycloak_user_id, action, run_at, created_by)
       VALUES (gen_random_uuid(), $1, 'DISABLE_USER', now(), $2)`,
      [legacy.subject, legacy.admin],
    );
    await db.query(
      `INSERT INTO offboarding_snapshots (id, keycloak_user_id, created_by)
       VALUES (gen_random_uuid(), $1, $2)`,
      [legacy.subject, legacy.admin],
    );
    await db.query(
      `INSERT INTO app_audit_log (id, actor_id, action, target_keycloak_user_id)
       VALUES (gen_random_uuid(), $2, 'user.disable', $1)`,
      [legacy.subject, legacy.admin],
    );
    await db.query(
      `INSERT INTO checklist_items (id, checklist_id, title, kind, position)
       VALUES (gen_random_uuid(), $1, 'Assign developer role', 'REALM_ROLE', 0)`,
      [LEGACY_CHECKLIST_ID],
    );
    await db.query(
      `WITH template AS (
         INSERT INTO onboarding_templates (id, name, updated_at)
         VALUES (gen_random_uuid(), 'Legacy', now()) RETURNING id
       )
       INSERT INTO template_items (id, template_id, title, kind, position)
       SELECT gen_random_uuid(), id, 'Assign developer role', 'REALM_ROLE', 0 FROM template`,
    );
    for (const name of migrationNames.filter(
      (n) => n >= SUBJECT_ID_MIGRATION && n < TEMPLATE_DATA_MIGRATION,
    )) {
      await applyMigration(db, name);
    }
    await seedTemplatesInTheOldShape(db);
    db.on('notice', (notice) => {
      if (notice.message) notices.push(notice.message);
    });
    for (const name of migrationNames.filter((n) => n >= TEMPLATE_DATA_MIGRATION)) {
      await applyMigration(db, name);
    }
  }, 60_000);

  afterAll(async () => {
    await db?.end();
    if (admin) {
      await admin.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
      await admin.end();
    }
  }, 60_000);

  describe('subject ID rename', () => {
    it.each([
      ['employee_checklists', 'subject_id'],
      ['scheduled_actions', 'subject_id'],
      ['offboarding_snapshots', 'subject_id'],
      ['app_audit_log', 'target_subject_id'],
    ])('keeps the existing value in %s.%s', async (table, column) => {
      const { rows } = await db.query(`SELECT ${column} AS value FROM ${table}`);
      expect(rows).toEqual([{ value: legacy.subject }]);
    });

    it('leaves no column or index named after Keycloak', async () => {
      const columns = await db.query(
        `SELECT table_name, column_name FROM information_schema.columns
         WHERE table_schema = 'public' AND column_name ILIKE '%keycloak%'`,
      );
      const indexes = await db.query(
        `SELECT indexname FROM pg_indexes
         WHERE schemaname = 'public' AND indexname ILIKE '%keycloak%'`,
      );
      expect(columns.rows).toEqual([]);
      expect(indexes.rows).toEqual([]);
    });

    it('renames the indexes to match the new columns', async () => {
      const { rows } = await db.query<{ indexname: string }>(
        `SELECT indexname FROM pg_indexes WHERE schemaname = 'public' AND indexname LIKE '%subject_id%'`,
      );
      expect(rows.map((r) => r.indexname).sort()).toEqual([
        'app_audit_log_target_subject_id_idx',
        'employee_checklists_subject_id_idx',
        'employee_checklists_subject_id_type_key',
        'offboarding_snapshots_subject_id_idx',
        'scheduled_actions_subject_id_idx',
      ]);
    });
  });

  describe('item kind rename', () => {
    it('keeps existing items, which now read ROLE instead of the provider-specific name', async () => {
      const templateItems = await db.query(
        `SELECT kind FROM template_items
         WHERE template_id = (SELECT id FROM onboarding_templates WHERE name = 'Legacy')`,
      );
      const checklistItems = await db.query(`SELECT kind FROM checklist_items`);
      expect(templateItems.rows).toEqual([{ kind: 'ROLE' }]);
      expect(checklistItems.rows).toEqual([{ kind: 'ROLE' }]);
    });

    it('has no value left over from the old name', async () => {
      const { rows } = await db.query(`SELECT enum_range(NULL::"ItemKind")::text AS kinds`);
      expect(rows).toEqual([{ kinds: '{GROUP_MEMBERSHIP,ROLE,MANUAL_TASK}' }]);
    });
  });

  describe('new columns', () => {
    it('gives rows that existed before the migration the documented backfill values', async () => {
      const audit = await db.query(`SELECT outcome, request_id FROM app_audit_log`);
      expect(audit.rows).toEqual([{ outcome: 'SUCCESS', request_id: null }]);

      const snapshots = await db.query(
        `SELECT client_roles, was_enabled FROM offboarding_snapshots`,
      );
      expect(snapshots.rows).toEqual([{ client_roles: [], was_enabled: true }]);
    });

    it('requires new audit rows to state their outcome', async () => {
      const error = await errorOf(
        db.query(
          `INSERT INTO app_audit_log (id, actor_id, action) VALUES (gen_random_uuid(), 'a', 'x')`,
        ),
      );
      expect(error.code).toBe(NOT_NULL_VIOLATION);
    });

    it('requires new snapshots to say whether the account was enabled', async () => {
      const error = await errorOf(
        db.query(
          `INSERT INTO offboarding_snapshots (id, subject_id, created_by)
           VALUES (gen_random_uuid(), 's', 'a')`,
        ),
      );
      expect(error.code).toBe(NOT_NULL_VIOLATION);
    });

    it('defaults client roles to an empty list', async () => {
      const { rows } = await db.query(
        `INSERT INTO offboarding_snapshots (id, subject_id, was_enabled, created_by)
         VALUES (gen_random_uuid(), 's2', false, 'a') RETURNING client_roles`,
      );
      expect(rows).toEqual([{ client_roles: [] }]);
    });
  });

  describe('template department', () => {
    const template = async (name: string) =>
      (
        await db.query(
          `SELECT t.department_ref, t.default_role,
                  coalesce(array_agg(i.kind || ':' || coalesce(i.target_ref, '') || '@' || i.position
                           ORDER BY i.position) FILTER (WHERE i.id IS NOT NULL), '{}') AS items
           FROM onboarding_templates t LEFT JOIN template_items i ON i.template_id = t.id
           WHERE t.name = $1 GROUP BY t.id`,
          [name],
        )
      ).rows[0];

    it('moves the one group item of a template into department_ref and defaults the role to member', async () => {
      expect(await template('Single')).toEqual({
        department_ref: '/Engineering',
        default_role: 'member',
        items: ['ROLE:developer@1', 'MANUAL_TASK:@2'],
      });
    });

    it('keeps a default role that was already set', async () => {
      expect(await template('SingleWithRole')).toEqual({
        department_ref: '/Sales',
        default_role: 'manager',
        items: [],
      });
    });

    it.each([
      ['Two', ['GROUP_MEMBERSHIP:/A@0', 'GROUP_MEMBERSHIP:/B@1']],
      ['NoTarget', ['GROUP_MEMBERSHIP:@0']],
      ['Legacy', ['ROLE:@0']],
    ])('leaves %s unchanged, with no department', async (name, items) => {
      expect(await template(name)).toEqual({ department_ref: null, default_role: null, items });
    });

    it('leaves a template that already has a department alone, group item included', async () => {
      expect(await template('Preset')).toEqual({
        department_ref: '/Sales',
        default_role: null,
        items: ['GROUP_MEMBERSHIP:/Other@0'],
      });
    });

    it('reports the templates it did not convert', () => {
      expect(notices).toEqual([
        'Templates left unchanged with an empty department_ref: Legacy, NoTarget, Two',
      ]);
    });

    it('changes nothing when the clean-up runs again', async () => {
      const before = await db.query(
        `SELECT id, department_ref, default_role FROM onboarding_templates ORDER BY name`,
      );
      const itemsBefore = await db.query(`SELECT id FROM template_items ORDER BY id`);

      await applyMigration(db, TEMPLATE_DATA_MIGRATION);

      const after = await db.query(
        `SELECT id, department_ref, default_role FROM onboarding_templates ORDER BY name`,
      );
      const itemsAfter = await db.query(`SELECT id FROM template_items ORDER BY id`);
      expect(after.rows).toEqual(before.rows);
      expect(itemsAfter.rows).toEqual(itemsBefore.rows);
    });
  });

  describe('checklist manager and start date', () => {
    it('adds a nullable text column for the manager and a nullable date column for the start date', async () => {
      const { rows } = await db.query(
        `SELECT column_name, data_type, is_nullable FROM information_schema.columns
         WHERE table_name = 'employee_checklists'
           AND column_name IN ('manager_subject_id', 'start_date') ORDER BY column_name`,
      );
      expect(rows).toEqual([
        { column_name: 'manager_subject_id', data_type: 'text', is_nullable: 'YES' },
        { column_name: 'start_date', data_type: 'date', is_nullable: 'YES' },
      ]);
    });

    it('leaves existing checklists without a manager or a start date', async () => {
      const { rows } = await db.query(
        `SELECT manager_subject_id, start_date FROM employee_checklists WHERE id = $1`,
        [LEGACY_CHECKLIST_ID],
      );
      expect(rows).toEqual([{ manager_subject_id: null, start_date: null }]);
    });

    it('stores a start date as a plain calendar date, with no time or time zone', async () => {
      const { rows } = await db.query(
        `INSERT INTO employee_checklists (id, subject_id, type, created_by, manager_subject_id, start_date)
         VALUES (gen_random_uuid(), 'dated-subject', 'ONBOARDING', 'admin-1', 'm-1', '2026-12-31')
         RETURNING start_date::text AS start_date, manager_subject_id`,
      );
      expect(rows).toEqual([{ start_date: '2026-12-31', manager_subject_id: 'm-1' }]);
    });
  });

  describe('one checklist per subject and type', () => {
    it('refuses a second onboarding checklist for the same subject', async () => {
      const error = await errorOf(
        db.query(
          `INSERT INTO employee_checklists (id, subject_id, type, created_by)
           VALUES (gen_random_uuid(), $1, 'ONBOARDING', 'admin-1')`,
          [legacy.subject],
        ),
      );
      expect(error.code).toBe(UNIQUE_VIOLATION);
    });

    it('allows a checklist of another type for the same subject', async () => {
      await expect(
        db.query(
          `INSERT INTO employee_checklists (id, subject_id, type, created_by)
           VALUES (gen_random_uuid(), $1, 'OFFBOARDING', 'admin-1')`,
          [legacy.subject],
        ),
      ).resolves.toBeDefined();
    });
  });

  describe('append-only audit log', () => {
    async function insertAuditRow(): Promise<string> {
      const { rows } = await db.query<{ id: string }>(
        `INSERT INTO app_audit_log (id, actor_id, action, outcome, target_subject_id, request_id)
         VALUES (gen_random_uuid(), 'admin-1', 'user.disable', 'FAILURE', 'subject-1', 'req-1')
         RETURNING id`,
      );
      return rows[0]!.id;
    }

    it('still accepts new rows', async () => {
      const id = await insertAuditRow();
      const { rows } = await db.query(
        `SELECT outcome, target_subject_id, request_id FROM app_audit_log WHERE id = $1`,
        [id],
      );
      expect(rows).toEqual([
        { outcome: 'FAILURE', target_subject_id: 'subject-1', request_id: 'req-1' },
      ]);
    });

    it('rejects UPDATE and leaves the row unchanged', async () => {
      const id = await insertAuditRow();

      const error = await errorOf(
        db.query(`UPDATE app_audit_log SET outcome = 'SUCCESS' WHERE id = $1`, [id]),
      );

      expect(error.code).toBe(RAISE_EXCEPTION);
      expect(error.message).toContain('append-only');
      const { rows } = await db.query(`SELECT outcome FROM app_audit_log WHERE id = $1`, [id]);
      expect(rows).toEqual([{ outcome: 'FAILURE' }]);
    });

    it('rejects DELETE and keeps the row', async () => {
      const id = await insertAuditRow();

      const error = await errorOf(db.query(`DELETE FROM app_audit_log WHERE id = $1`, [id]));

      expect(error.code).toBe(RAISE_EXCEPTION);
      expect(error.message).toContain('append-only');
      const { rowCount } = await db.query(`SELECT 1 FROM app_audit_log WHERE id = $1`, [id]);
      expect(rowCount).toBe(1);
    });

    it('rejects an unfiltered DELETE of the whole table', async () => {
      const before = await db.query(`SELECT count(*)::int AS n FROM app_audit_log`);
      const error = await errorOf(db.query(`DELETE FROM app_audit_log`));
      const after = await db.query(`SELECT count(*)::int AS n FROM app_audit_log`);

      expect(error.code).toBe(RAISE_EXCEPTION);
      expect(after.rows).toEqual(before.rows);
    });

    it('rejects TRUNCATE and keeps every row', async () => {
      await insertAuditRow();
      const before = await db.query(`SELECT count(*)::int AS n FROM app_audit_log`);
      expect(before.rows[0].n).toBeGreaterThan(0);

      const error = await errorOf(db.query(`TRUNCATE app_audit_log`));

      expect(error.code).toBe(RAISE_EXCEPTION);
      expect(error.message).toContain('append-only');
      expect(error.message).toContain('TRUNCATE');
      const after = await db.query(`SELECT count(*)::int AS n FROM app_audit_log`);
      expect(after.rows).toEqual(before.rows);
    });

    it('rejects TRUNCATE together with other tables, leaving all of them intact', async () => {
      await insertAuditRow();
      await db.query(
        `INSERT INTO scheduled_actions (id, subject_id, action, run_at, created_by)
         VALUES (gen_random_uuid(), 'subject-2', 'DISABLE_USER', now(), 'admin-1')`,
      );
      const count = async (table: string) =>
        (await db.query(`SELECT count(*)::int AS n FROM ${table}`)).rows[0].n as number;
      const auditBefore = await count('app_audit_log');
      const actionsBefore = await count('scheduled_actions');

      const error = await errorOf(db.query(`TRUNCATE app_audit_log, scheduled_actions`));

      expect(error.code).toBe(RAISE_EXCEPTION);
      expect(await count('app_audit_log')).toBe(auditBefore);
      expect(await count('scheduled_actions')).toBe(actionsBefore);
    });

    it('has both triggers installed and enabled on the audit log', async () => {
      const { rows } = await db.query(
        `SELECT tgname, tgenabled FROM pg_trigger
         WHERE tgrelid = 'app_audit_log'::regclass AND NOT tgisinternal ORDER BY tgname`,
      );
      expect(rows.map((r) => r.tgname)).toEqual([
        'app_audit_log_append_only',
        'app_audit_log_no_truncate',
      ]);
      expect(rows.every((r) => r.tgenabled === 'O')).toBe(true);
    });

    it('does not restrict the other tables', async () => {
      await expect(
        db.query(`UPDATE scheduled_actions SET status = 'CANCELLED'`),
      ).resolves.toBeDefined();
      await expect(db.query(`DELETE FROM scheduled_actions`)).resolves.toBeDefined();
    });
  });

  describe('through the Prisma client', () => {
    let prisma: PrismaClient;
    beforeAll(() => {
      prisma = createPrisma(dbUrl);
    });
    afterAll(async () => {
      await prisma?.$disconnect();
    });

    it('writes the renamed and new fields, and cannot change a row afterwards', async () => {
      const row = await prisma.appAuditLog.create({
        data: {
          actorId: 'admin-1',
          action: 'user.disable',
          outcome: 'SUCCESS',
          targetSubjectId: 'subject-9',
          requestId: 'req-9',
        },
      });
      expect(row).toMatchObject({ targetSubjectId: 'subject-9', requestId: 'req-9' });

      await expect(
        prisma.appAuditLog.update({ where: { id: row.id }, data: { outcome: 'FAILURE' } }),
      ).rejects.toThrow(/append-only/);
      await expect(prisma.appAuditLog.delete({ where: { id: row.id } })).rejects.toThrow(
        /append-only/,
      );
      expect(await prisma.appAuditLog.count({ where: { id: row.id } })).toBe(1);
    });

    it('stores a snapshot with client roles and the enabled flag', async () => {
      const snapshot = await prisma.offboardingSnapshot.create({
        data: {
          subjectId: 'subject-9',
          wasEnabled: true,
          clientRoles: [{ clientId: 'crm', role: 'sales' }],
          createdBy: 'admin-1',
        },
      });
      expect(snapshot.clientRoles).toEqual([{ clientId: 'crm', role: 'sales' }]);
      expect(snapshot.wasEnabled).toBe(true);
    });
  });
});
