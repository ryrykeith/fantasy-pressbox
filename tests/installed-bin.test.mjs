import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { PACKAGE_ROOT } from '../src/config.mjs';

// The README's install path is `npm install -g fantasy-pressbox`, then
// `fantasy-pressbox <command>`. npm installs the bin as a symlink to
// src/cli.mjs, so the command a reader types runs the CLI through a link, not
// at its real path. If the CLI only recognised its real path as "being run",
// the installed command would print nothing and exit zero.

test('the CLI runs when started through a symlink, as an npm-installed bin is', () => {
  const binDir = mkdtempSync(join(tmpdir(), 'pressbox-bin-'));
  const linked = join(binDir, 'fantasy-pressbox');
  symlinkSync(join(PACKAGE_ROOT, 'src', 'cli.mjs'), linked);

  const result = spawnSync(process.execPath, [linked, '--help'], { encoding: 'utf8' });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Fantasy Pressbox/);
  assert.match(result.stdout, /Commands/);
});
