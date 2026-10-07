import { readdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { ROOT } from './lib.mjs';

const targets = ['dist', 'out', '.turbo', 'coverage', 'test-results', 'playwright-report'];
const workspaces = ['apps', 'packages'].flatMap((dir) =>
  readdirSync(path.join(ROOT, dir), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(ROOT, dir, entry.name)),
);

for (const base of [ROOT, ...workspaces]) {
  for (const target of targets) rmSync(path.join(base, target), { recursive: true, force: true });
  if (process.argv.includes('--deps'))
    rmSync(path.join(base, 'node_modules'), { recursive: true, force: true });
}
console.log(
  `Cleaned ${targets.join(', ')}${process.argv.includes('--deps') ? ' and node_modules' : ''}`,
);
