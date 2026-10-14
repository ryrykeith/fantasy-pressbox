import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

import { PACKAGE_ROOT } from '../src/config.mjs';

// The purity guard for `fantasy-pressbox/core` (src/core/index.mjs).
//
// The website runs core in a browser from a CDN with no build step, so every
// module core reaches must load there. This walks the static import graph from
// the entry and fails on:
//   - any `node:` import (static, dynamic or re-export),
//   - any use of `process` or `import.meta`,
//   - any path that reaches generate.mjs (the AI call),
//   - a bare package import (core has no dependencies to load).
// src/espn/ is covered the same way: it is checked wherever core reaches it.
// The ESPN cookie client is pure code that the provider registry reaches, so
// it is not forbidden as a module; core simply does not export it (the export
// list test below), which keeps the fetch CLI-only.

const ENTRY = join(PACKAGE_ROOT, 'src', 'core', 'index.mjs');
const FORBIDDEN_MODULES = ['src/generate.mjs'];

/** Code with comments blanked and string contents kept, so prose is not a use. */
function stripComments(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:'"`\\])\/\/[^\n]*/g, '$1');
}

// Static statements start a line, so a quoted word in code is not mistaken for one.
const STATIC_SPEC = /^(?:import|export)\b[^;'"`]*?\bfrom\s*['"]([^'"]+)['"]|^import\s*['"]([^'"]+)['"]/gm;
const DYNAMIC_SPEC = /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

function specifiers(code) {
  const found = [];
  for (const re of [STATIC_SPEC, DYNAMIC_SPEC]) {
    for (const match of code.matchAll(re)) found.push(match[1] ?? match[2]);
  }
  return found;
}

/** Walk the graph from `entry`; returns { files, problems }. */
export function walkCore(entry, read = (file) => readFileSync(file, 'utf8')) {
  const files = new Set();
  const problems = [];
  const stack = [entry];
  while (stack.length > 0) {
    const file = stack.pop();
    if (files.has(file)) continue;
    files.add(file);
    const rel = relative(PACKAGE_ROOT, file).split('\\').join('/');
    if (FORBIDDEN_MODULES.includes(rel)) {
      problems.push(`${rel} is reachable from core`);
      continue;
    }
    const code = stripComments(read(file));
    if (/\bprocess\b/.test(code)) problems.push(`${rel} uses process`);
    if (/\bimport\.meta\b/.test(code)) problems.push(`${rel} uses import.meta`);
    for (const spec of specifiers(code)) {
      if (spec.startsWith('node:')) problems.push(`${rel} imports ${spec}`);
      else if (!spec.startsWith('.')) problems.push(`${rel} imports the bare specifier ${spec}`);
      else stack.push(resolve(dirname(file), spec));
    }
  }
  return { files: [...files], problems };
}

test('core reaches no node: import, process, import.meta or generate.mjs', () => {
  const { files, problems } = walkCore(ENTRY);
  assert.ok(files.length > 10, `the walk should reach the real module graph (reached ${files.length})`);
  assert.deepEqual(problems, []);
});

test('the walk reaches the ESPN import modules, so the guard covers src/espn/', () => {
  const { files } = walkCore(ENTRY);
  const rel = files.map((f) => relative(PACKAGE_ROOT, f).split('\\').join('/'));
  for (const expected of ['src/espn/import.mjs', 'src/espn/urls.mjs', 'src/espn/shape.mjs']) {
    assert.ok(rel.includes(expected), `${expected} should be reachable from core`);
  }
});

test('the guard fails on a node: import added anywhere core reaches', () => {
  const files = {
    [ENTRY]: "export { a } from './a.mjs';",
    [join(dirname(ENTRY), 'a.mjs')]: "import { readFileSync } from 'node:fs';\nexport const a = readFileSync;",
  };
  const { problems } = walkCore(ENTRY, (file) => files[file]);
  assert.deepEqual(problems, ['src/core/a.mjs imports node:fs']);
});

test('the guard fails on process, import.meta, dynamic node: imports and generate.mjs', () => {
  const dir = dirname(ENTRY);
  const files = {
    [ENTRY]: "export * from './p.mjs';\nexport * from '../generate.mjs';",
    [join(dir, 'p.mjs')]: "export const x = process.env.X;\nexport const u = import.meta.url;\nexport const l = () => import('node:path');",
  };
  const { problems } = walkCore(ENTRY, (file) => files[file] ?? '');
  assert.deepEqual(problems.sort(), [
    'src/core/p.mjs imports node:path',
    'src/core/p.mjs uses import.meta',
    'src/core/p.mjs uses process',
    'src/generate.mjs is reachable from core',
  ]);
});

test('core exports the documented surface and nothing that fetches from ESPN', async () => {
  const core = await import('../src/core/index.mjs');
  const expected = [
    'LEAGUE_FILE_SCHEMA_VERSION', 'newLeagueFile', 'parseLeagueFile', 'serializeLeagueFile',
    'leagueFileFromWorkspace', 'createMemoryStore', 'OPTIONS', 'EDITIONS', 'resolveSettings',
    'rankEmoji', 'openLeague', 'resolveWeek', 'prepareEdition', 'buildPrompt', 'splitPosts',
    'checkPosts', 'extractJsonBlock', 'stripJsonBlock', 'formatPost', 'looksCollapsed',
    'recordEdition', 'gradePredictions', 'inspectLeague', 'loadAssets', 'readSavedFiles',
    'classifySaved', 'parseSavedFile', 'importedWeekBundle', 'leaguePageFreshness',
    'staleLeagueNotice', 'espnImportLinks', 'EspnImportError', 'EspnStaleLeagueError',
    'EspnShapeError',
  ];
  assert.deepEqual(Object.keys(core).sort(), [...expected].sort());
});
