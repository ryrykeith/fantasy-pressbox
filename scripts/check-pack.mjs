#!/usr/bin/env node
/**
 * Fails if the npm tarball would ship something that must never leave this
 * repository.
 *
 * The `files` list in package.json is an allowlist, so in principle nothing
 * else can get in. In practice an allowlist is one careless glob away from
 * shipping a league's `.env`, its fetched data, or a real prospect board, and
 * a publish cannot be taken back. This reads the file list npm itself would
 * pack and checks it against the paths that are never allowed, whatever
 * `files` says. CI runs it on every pull request.
 *
 * Usage:
 *   node scripts/check-pack.mjs                                  (runs npm pack --dry-run)
 *   npm pack --dry-run --json | node scripts/check-pack.mjs -    (reads the JSON from stdin)
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

// Each rule matches a path relative to the package root, as npm reports it.
const FORBIDDEN = [
  { rule: '.env files (only .env.example may ship)', test: (p) => /(^|\/)\.env(\.|$)/.test(p) && !/(^|\/)\.env\.example$/.test(p) },
  { rule: 'fetched league data (data/)', test: (p) => p.startsWith('data/') },
  { rule: 'generated coverage (output/)', test: (p) => p.startsWith('output/') },
  { rule: 'a real prospect board (config/prospects.<season>.yml)', test: (p) => /^config\/prospects\.\d+\.yml$/.test(p) },
  { rule: 'n-dx state (.rex/, .hench/, .sourcevision/)', test: (p) => /^\.(rex|hench|sourcevision)\//.test(p) },
  { rule: 'assistant folders (.claude/, .agents/, .codex/)', test: (p) => /^\.(claude|agents|codex)\//.test(p) },
  { rule: 'tests (tests/)', test: (p) => p.startsWith('tests/') },
  { rule: 'maintainer scripts (scripts/)', test: (p) => p.startsWith('scripts/') },
];

const json = process.argv[2] === '-'
  ? readFileSync(0, 'utf8')
  : execFileSync('npm', ['pack', '--dry-run', '--json'], { encoding: 'utf8', shell: process.platform === 'win32' });

const [pack] = JSON.parse(json);
const paths = pack.files.map((f) => f.path.replaceAll('\\', '/'));

if (paths.length === 0) {
  console.error('npm pack reported no files; refusing to call that a pass.');
  process.exit(1);
}

const violations = paths.flatMap((path) =>
  FORBIDDEN.filter(({ test }) => test(path)).map(({ rule }) => ({ path, rule })));

if (violations.length > 0) {
  console.error(`The package would ship ${violations.length} forbidden file(s):`);
  for (const { path, rule } of violations) console.error(`  ${path}  — ${rule}`);
  process.exit(1);
}

console.log(`Pack check passed: ${paths.length} files, none forbidden (${pack.filename}).`);
