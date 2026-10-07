import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync } from 'node:fs';
import path from 'node:path';

export const ROOT = path.resolve(import.meta.dirname, '..');

const MIN_NODE = [22, 22, 1];

export function step(message) {
  console.log(`\n→ ${message}`);
}

export function fail(message) {
  console.error(`\n✗ ${message}`);
  process.exit(1);
}

export function run(command, args, { hint } = {}) {
  const result = spawnSync(`${command} ${args.join(' ')}`, {
    cwd: ROOT,
    stdio: 'inherit',
    shell: true,
  });
  if (result.error || result.status !== 0) {
    fail(`"${command} ${args.join(' ')}" failed.${hint ? `\n  ${hint}` : ''}`);
  }
}

export function checkNode() {
  const current = process.versions.node.split('.').map(Number);
  const firstDifference = MIN_NODE.findIndex((part, i) => (current[i] ?? 0) !== part);
  const tooOld =
    firstDifference !== -1 && (current[firstDifference] ?? 0) < MIN_NODE[firstDifference];
  if (tooOld)
    fail(`Node ${MIN_NODE.join('.')} or newer is required (found ${process.versions.node}).`);
}

export function ensureEnvFile() {
  const envPath = path.join(ROOT, '.env');
  if (existsSync(envPath)) return console.log('.env already exists, leaving it alone');
  copyFileSync(path.join(ROOT, '.env.example'), envPath);
  console.log('Created .env from .env.example. Edit it if your identity provider settings differ.');
}

export function startDatabase() {
  run('docker', ['compose', 'up', '-d', '--wait'], {
    hint: 'Is Docker running? Start Docker Desktop and try again.',
  });
}

export function migrateDatabase() {
  run('pnpm', ['--filter', '@accessdesk/api', 'db:deploy']);
}

export function seedDatabase() {
  run('pnpm', ['--filter', '@accessdesk/api', 'db:seed']);
}
