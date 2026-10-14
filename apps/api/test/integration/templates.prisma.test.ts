import { execSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPrisma, type PrismaClient } from '../../src/infra/db';
import { PrismaTemplateRepository } from '../../src/modules/templates/prisma-templates.repository';

const adminUrl = process.env.TEST_DATABASE_URL;
const API_DIR = path.resolve(import.meta.dirname, '../..');
const MIGRATIONS_DIR = path.join(API_DIR, 'prisma/migrations');
const DEFAULT_TASKS = [
  'Hand over laptop',
  'Create email account',
  'Hand over access card',
  'Introduce to the team and manager',
];

describe.skipIf(!adminUrl)('the default template on a real database', () => {
  const dbName = `accessdesk_test_${randomBytes(4).toString('hex')}`;
  let admin: pg.Client;
  let db: pg.Client;
  let dbUrl: string;
  let prisma: PrismaClient;
  let repo: PrismaTemplateRepository;

  const seed = () =>
    execSync('pnpm exec tsx prisma/seed.ts', {
      cwd: API_DIR,
      env: { ...process.env, DATABASE_URL: dbUrl },
      encoding: 'utf8',
    });

  beforeAll(async () => {
    admin = new pg.Client({ connectionString: adminUrl });
    await admin.connect();
    await admin.query(`CREATE DATABASE ${dbName}`);
    const url = new URL(adminUrl!);
    url.pathname = `/${dbName}`;
    dbUrl = url.toString();
    db = new pg.Client({ connectionString: dbUrl });
    await db.connect();
    const names = readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
    for (const name of names) {
      await db.query(readFileSync(path.join(MIGRATIONS_DIR, name, 'migration.sql'), 'utf8'));
    }
    prisma = createPrisma(dbUrl);
    repo = new PrismaTemplateRepository(prisma);
  }, 60_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await db?.end();
    if (admin) {
      await admin.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
      await admin.end();
    }
  }, 60_000);

  const insertTemplate = async (name: string, isDefault: boolean, createdAt: string, id?: string) =>
    db.query(
      `INSERT INTO onboarding_templates (id, name, is_default, created_at, updated_at)
       VALUES (COALESCE($4::uuid, gen_random_uuid()), $1, $2, $3, now())`,
      [name, isDefault, createdAt, id ?? null],
    );

  it('is null while no template is flagged', async () => {
    await insertTemplate('Plain', false, '2026-01-01T00:00:00Z');

    expect(await repo.findDefault()).toBeNull();
  });

  it('chooses the oldest when two rows are flagged as the default', async () => {
    await insertTemplate('Newer default', true, '2026-03-01T00:00:00Z');
    await insertTemplate('Older default', true, '2026-02-01T00:00:00Z');
    await insertTemplate('Newest default', true, '2026-04-01T00:00:00Z');

    const found = await repo.findDefault();

    expect(found?.name).toBe('Older default');
    expect(found?.isDefault).toBe(true);
  });

  it('breaks a tie on the creation time by the lowest id', async () => {
    await db.query(`DELETE FROM onboarding_templates WHERE is_default`);
    const at = '2026-05-01T00:00:00Z';
    await insertTemplate('Tie B', true, at, '00000000-0000-4000-8000-00000000000b');
    await insertTemplate('Tie A', true, at, '00000000-0000-4000-8000-00000000000a');

    expect((await repo.findDefault())?.name).toBe('Tie A');
  });

  describe('the seed', () => {
    beforeAll(async () => {
      await db.query(`DELETE FROM onboarding_templates`);
    });

    it('creates General onboarding as the one default, with only the four manual tasks, in order', async () => {
      seed();

      const found = await repo.findDefault();

      expect(found).toMatchObject({
        name: 'General onboarding',
        isDefault: true,
        departmentRef: null,
        defaultRole: null,
      });
      expect(found?.items.map((item) => [item.kind, item.title, item.position])).toEqual(
        DEFAULT_TASKS.map((title, position) => ['MANUAL_TASK', title, position]),
      );
      expect(found?.items.every((item) => item.targetRef === null)).toBe(true);
      const { rows } = await db.query(
        `SELECT name FROM onboarding_templates WHERE is_default ORDER BY name`,
      );
      expect(rows).toEqual([{ name: 'General onboarding' }]);
    });

    it('creates the other three templates, none of them flagged as the default', async () => {
      const { rows } = await db.query(
        `SELECT name, is_default FROM onboarding_templates ORDER BY name`,
      );
      expect(rows).toEqual([
        { name: 'Developer', is_default: false },
        { name: 'General onboarding', is_default: true },
        { name: 'HR', is_default: false },
        { name: 'Sales', is_default: false },
      ]);
    });

    it('changes nothing when it runs again, and keeps edits and existing checklists', async () => {
      await db.query(
        `UPDATE onboarding_templates SET description = 'Edited by hand' WHERE name = 'Developer'`,
      );
      await db.query(`DELETE FROM template_items WHERE title = 'Order laptop'`);
      await db.query(
        `UPDATE onboarding_templates SET description = 'Edited too' WHERE name = 'General onboarding'`,
      );
      await db.query(
        `INSERT INTO employee_checklists (id, subject_id, type, created_by)
         VALUES (gen_random_uuid(), 'existing-subject', 'ONBOARDING', 'admin-1')`,
      );
      const snapshot = async () => ({
        templates: (await db.query(`SELECT * FROM onboarding_templates ORDER BY name`)).rows,
        items: (await db.query(`SELECT * FROM template_items ORDER BY id`)).rows,
        checklists: (await db.query(`SELECT * FROM employee_checklists ORDER BY id`)).rows,
      });
      const before = await snapshot();

      seed();

      expect(await snapshot()).toEqual(before);
    });
  });
});
