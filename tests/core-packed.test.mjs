import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { PACKAGE_ROOT } from '../src/config.mjs';

// The package's real shipping path: `npm pack`, install the tarball into an
// empty project, then use it the way a consumer would. The package has no
// dependencies, so the install needs no network.

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

function packAndInstall() {
  const root = mkdtempSync(join(tmpdir(), 'pressbox-packed-'));
  const packDir = join(root, 'pack');
  const project = join(root, 'project');
  mkdirSync(packDir);
  mkdirSync(project);
  execFileSync(npm, ['pack', '--pack-destination', packDir, '--silent'], {
    cwd: PACKAGE_ROOT,
    encoding: 'utf8',
    shell: process.platform === 'win32',
  });
  const [tarball] = readdirSync(packDir);
  writeFileSync(join(project, 'package.json'), JSON.stringify({ name: 'consumer', private: true, type: 'module' }));
  execFileSync(npm, ['install', join(packDir, tarball), '--no-audit', '--no-fund', '--silent'], {
    cwd: project,
    encoding: 'utf8',
    shell: process.platform === 'win32',
  });
  return { root, project };
}

test('an installed package exposes fantasy-pressbox/core, blocks internals, and keeps its bin', () => {
  const { root, project } = packAndInstall();
  try {
    const probe = `
      const core = await import('fantasy-pressbox/core');
      const out = { buildPrompt: typeof core.buildPrompt, names: Object.keys(core).length };
      try { await import('fantasy-pressbox/src/cli.mjs'); out.internal = 'imported'; }
      catch (error) { out.internal = error.code; }
      console.log(JSON.stringify(out));
    `;
    const imported = spawnSync(process.execPath, ['--input-type=module', '-e', probe], { cwd: project, encoding: 'utf8' });
    assert.equal(imported.status, 0, imported.stderr);
    const out = JSON.parse(imported.stdout);
    assert.equal(out.buildPrompt, 'function');
    assert.ok(out.names > 30);
    assert.equal(out.internal, 'ERR_PACKAGE_PATH_NOT_EXPORTED');

    const bin = join(project, 'node_modules', '.bin', 'fantasy-pressbox');
    const help = spawnSync(bin, ['--help'], { cwd: project, encoding: 'utf8', shell: process.platform === 'win32' });
    assert.equal(help.status, 0, help.stderr);
    assert.match(help.stdout, /Fantasy Pressbox/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
