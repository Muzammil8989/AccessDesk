import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const allowlist = JSON.parse(
  readFileSync(path.join(ROOT, 'scripts/naming-allowlist.json'), 'utf8'),
);
const word = new RegExp(allowlist.word, 'i');
const MAX_BYTES = 2 * 1024 * 1024;

function globToRegExp(glob) {
  const source = glob
    .split('**')
    .map((part) => part.split('*').map(escapeRegExp).join('[^/]*'))
    .join('.*');
  return new RegExp(`^${source}$`);
}
const escapeRegExp = (text) => text.replace(/[.+?^${}()|[\]\\]/g, '\\$&');

const allowedFiles = Object.keys(allowlist.files).map(globToRegExp);
const globalTokens = Object.keys(allowlist.tokens);

function stripTokens(text, tokens) {
  let result = text;
  for (const token of tokens) result = result.split(token).join('');
  return result;
}

function listFiles() {
  const out = execFileSync(
    'git',
    ['ls-files', '-z', '--cached', '--others', '--exclude-standard'],
    {
      cwd: ROOT,
      maxBuffer: 64 * 1024 * 1024,
    },
  );
  return [...new Set(out.toString('utf8').split('\0').filter(Boolean))].sort();
}

export function findViolations(files, read) {
  const violations = [];
  for (const file of files) {
    if (allowedFiles.some((pattern) => pattern.test(file))) continue;
    const tokens = [...globalTokens, ...Object.keys(allowlist.fileTokens[file] ?? {})];

    if (word.test(stripTokens(file, tokens))) {
      violations.push({ file, line: 0, text: '(the file name or path)' });
    }

    const buffer = read(file);
    if (buffer === null || buffer.length > MAX_BYTES || buffer.subarray(0, 8192).includes(0)) {
      continue;
    }
    buffer
      .toString('utf8')
      .split('\n')
      .forEach((line, index) => {
        if (word.test(stripTokens(line, tokens))) {
          violations.push({ file, line: index + 1, text: line.trim().slice(0, 140) });
        }
      });
  }
  return violations;
}

function readOrNull(file) {
  try {
    return readFileSync(path.join(ROOT, file));
  } catch {
    return null;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename) {
  const violations = findViolations(listFiles(), readOrNull);
  if (violations.length === 0) {
    console.log('Naming check passed: the provider name only appears where the allowlist says.');
  } else {
    console.error(
      `Naming check failed: "${allowlist.word}" appears outside scripts/naming-allowlist.json ` +
        `(${violations.length} place${violations.length === 1 ? '' : 's'}).\n` +
        'Use a neutral word such as "identity provider", or see ADR 0009 if it really belongs there.\n',
    );
    for (const { file, line, text } of violations) {
      console.error(`  ${file}${line ? `:${line}` : ''}  ${text}`);
    }
    process.exit(1);
  }
}
