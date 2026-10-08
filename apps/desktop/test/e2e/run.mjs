import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../../../..');
const SCRATCH_DATABASE_NAME = /^accessdesk_e2e_[0-9a-f]{8}$/;
const apiReq = createRequire(`${ROOT}/apps/api/package.json`);

function run(command, args, options) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      stdio: 'inherit',
      shell: process.platform === 'win32',
      ...options,
    });
    child.on('exit', (code) => resolve(code ?? 1));
    child.on('error', () => resolve(1));
  });
}

const serverUrl = process.env.TEST_DATABASE_URL;
if (!serverUrl) {
  console.log(
    'TEST_DATABASE_URL is not set: running without a database. The retry scenario will be skipped.',
  );
  process.exit(await run('node', ['test/e2e/smoke.mjs'], { cwd: `${ROOT}/apps/desktop` }));
}

const pg = apiReq('pg');
const scratchName = `accessdesk_e2e_${randomBytes(4).toString('hex')}`;
if (!SCRATCH_DATABASE_NAME.test(scratchName))
  throw new Error('Refusing an unexpected database name');

const maintenanceUrl = new URL(serverUrl);
maintenanceUrl.pathname = '/postgres';
const scratchUrl = new URL(serverUrl);
scratchUrl.pathname = `/${scratchName}`;

const admin = new pg.Client({ connectionString: maintenanceUrl.toString() });
let exitCode = 1;
let created = false;
try {
  await admin.connect();
  await admin.query(`CREATE DATABASE ${scratchName}`);
  created = true;
  console.log(`Created scratch database ${scratchName}`);

  const migrated = await run('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
    cwd: `${ROOT}/apps/api`,
    env: { ...process.env, DATABASE_URL: scratchUrl.toString() },
  });
  if (migrated !== 0) throw new Error('Applying the migrations to the scratch database failed');

  exitCode = await run('node', ['test/e2e/smoke.mjs'], {
    cwd: `${ROOT}/apps/desktop`,
    env: { ...process.env, E2E_DATABASE_URL: scratchUrl.toString() },
  });
} catch (error) {
  console.error(String(error));
} finally {
  if (created) {
    await admin.query(`DROP DATABASE IF EXISTS ${scratchName} WITH (FORCE)`).catch((error) => {
      console.error(`Could not drop ${scratchName}: ${String(error)}`);
      exitCode = 1;
    });
    console.log(`Dropped scratch database ${scratchName}`);
  }
  await admin.end().catch(() => {});
}
process.exit(exitCode);
