import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';

import { PACKAGE_ROOT } from '../src/config.mjs';

// The provider boundary (docs/architecture.md, "Adding another platform").
//
// A league platform's code lives in its own directory (src/sleeper/, later
// src/espn/), and src/providers.mjs is the only door to them. Two rules keep
// that true, and both are checked here against the source itself:
//
//   1. Nothing outside the provider directories and the registry imports a
//      provider directory.
//   2. A raw Sleeper field name does not appear in code outside src/sleeper/.
//      Comments that explain Sleeper are allowed.

const SRC = join(PACKAGE_ROOT, 'src');
const SLEEPER_DIR = join(SRC, 'sleeper');
const PROVIDER_DIRS = [SLEEPER_DIR, join(SRC, 'espn')];
const REGISTRY = join(SRC, 'providers.mjs');

/** Sleeper's own field names. They are one platform's storage details, not concepts. */
const RAW_SLEEPER_FIELDS = [
  'roster_id',
  'owner_id',
  'matchup_id',
  'players_points',
  'starters_points',
  'fpts_decimal',
  'waiver_bid',
  'last_scored_leg',
];

const isInside = (dir, file) => file === dir || file.startsWith(dir + sep);
const inProviderDir = (file) => PROVIDER_DIRS.some((dir) => isInside(dir, file));

function sourceFiles(dir) {
  const files = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) files.push(...sourceFiles(path));
    else if (path.endsWith('.mjs')) files.push(path);
  }
  return files;
}

/** Code with its comments blanked, so a field named in prose is not a use. */
function stripComments(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');
}

/** Every module specifier a file imports, statically or dynamically, or re-exports from. */
function importSpecifiers(text) {
  const code = stripComments(text);
  const found = [];
  for (const pattern of [
    /\bfrom\s*['"]([^'"]+)['"]/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\bimport\s*['"]([^'"]+)['"]/g,
  ]) {
    for (const match of code.matchAll(pattern)) found.push(match[1]);
  }
  return found;
}

/** The repository's own code: src/, the setup script and the maintenance scripts. */
function ownedFiles() {
  const files = sourceFiles(SRC);
  files.push(join(PACKAGE_ROOT, 'setup.mjs'));
  const scripts = join(PACKAGE_ROOT, 'scripts');
  if (existsSync(scripts)) files.push(...sourceFiles(scripts));
  return files;
}

/** The files that import a provider directory without being allowed to. */
function importLeaks(files) {
  const leaks = [];
  for (const file of files) {
    if (inProviderDir(file) || file === REGISTRY) continue;
    for (const specifier of importSpecifiers(readFileSync(file, 'utf8'))) {
      if (!specifier.startsWith('.')) continue; // bare and node: specifiers are not ours
      const target = resolve(dirname(file), specifier);
      if (PROVIDER_DIRS.some((dir) => isInside(dir, target))) {
        leaks.push(`${relative(PACKAGE_ROOT, file)} imports ${specifier}`);
      }
    }
  }
  return leaks;
}

const usesField = (code, field) => new RegExp(`\\b${field}\\b`).test(code);

/** The lines outside src/sleeper/ that use a raw Sleeper field name in code. */
function fieldLeaks(files) {
  const leaks = [];
  for (const file of files) {
    if (isInside(SLEEPER_DIR, file)) continue;
    stripComments(readFileSync(file, 'utf8')).split('\n').forEach((line, index) => {
      for (const field of RAW_SLEEPER_FIELDS) {
        if (usesField(line, field)) leaks.push(`${relative(PACKAGE_ROOT, file)}:${index + 1} uses ${field}`);
      }
    });
  }
  return leaks;
}

test('the guard sees the source it is guarding', () => {
  const files = ownedFiles();
  assert.ok(files.length > 20, `only ${files.length} files found`);
  assert.ok(files.includes(REGISTRY));
  assert.ok(files.some((file) => isInside(SLEEPER_DIR, file)));
  assert.ok(files.includes(join(PACKAGE_ROOT, 'setup.mjs')));
});

test('only the registry imports a provider directory', () => {
  assert.deepEqual(importLeaks(ownedFiles()), []);
});

test('the registry does import the Sleeper provider', () => {
  assert.ok(importSpecifiers(readFileSync(REGISTRY, 'utf8')).includes('./sleeper/provider.mjs'));
});

test('no raw Sleeper field name appears in code outside src/sleeper/', () => {
  assert.deepEqual(fieldLeaks(ownedFiles()), []);
});

// The guard has to be able to fail. These feed the helpers a planted leak.

test('import detection finds static, dynamic, bare and re-export imports', () => {
  const text = [
    "import a from './sleeper/client.mjs';",
    "import { b } from '../espn/client.mjs';",
    "export { c } from './sleeper/normalize.mjs';",
    "const d = await import('./sleeper/provider.mjs');",
    "import './espn/side-effect.mjs';",
  ].join('\n');
  assert.deepEqual(importSpecifiers(text), [
    './sleeper/client.mjs',
    '../espn/client.mjs',
    './sleeper/normalize.mjs',
    './sleeper/provider.mjs',
    './espn/side-effect.mjs',
  ]);
});

test('an import named only in a comment is not an import', () => {
  const text = "// import x from './sleeper/client.mjs';\n/* import y from './espn/c.mjs' */\n";
  assert.deepEqual(importSpecifiers(text), []);
});

test('comments are blanked but a URL in a string survives', () => {
  const stripped = stripComments("const u = 'https://example.test/x'; // roster_id here\n/* owner_id */ const k = 1;");
  assert.ok(stripped.includes('https://example.test/x'));
  assert.ok(!stripped.includes('roster_id'));
  assert.ok(!stripped.includes('owner_id'));
  assert.ok(stripped.includes('const k = 1;'));
});

test('a Sleeper field in code is a leak, and the same field in a comment is not', () => {
  assert.ok(usesField(stripComments('const id = team.roster_id;'), 'roster_id'));
  assert.ok(!usesField(stripComments('// roster_id survives a rename\nconst id = team.rosterId;'), 'roster_id'));
});

test('every listed field is spelled as Sleeper spells it', () => {
  assert.equal(new Set(RAW_SLEEPER_FIELDS).size, RAW_SLEEPER_FIELDS.length);
  for (const field of RAW_SLEEPER_FIELDS) assert.match(field, /^[a-z]+(_[a-z]+)+$/);
});
