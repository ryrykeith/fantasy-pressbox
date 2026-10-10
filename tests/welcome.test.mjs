/**
 * How the CLI talks someone through starting (src/welcome.mjs): the command
 * line its advice prints, the banner, and the weekly routine.
 *
 * The command line matters more than it looks. Every refusal and every "try
 * this next" ends in a command, and one that does not resolve for this person
 * — `node src/cli.mjs` typed from a league folder, or a bare
 * `fantasy-pressbox` after npx has exited — is a dead end on their first run.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { PACKAGE_ROOT } from '../src/config.mjs';
import { banner, binOnPath, BIN_NAME, cliCommand, displayPath, weeklyRoutine } from '../src/welcome.mjs';

const CLI = join(PACKAGE_ROOT, 'src', 'cli.mjs');

function tempDir(prefix = 'pressbox-welcome-') {
  return realpathSync(mkdtempSync(join(tmpdir(), prefix)));
}

/** A package installed into a project's node_modules, as npm lays one out. */
function installedPackage() {
  const project = tempDir();
  const packageRoot = join(project, 'node_modules', BIN_NAME);
  mkdirSync(join(packageRoot, 'src'), { recursive: true });
  writeFileSync(join(packageRoot, 'src', 'cli.mjs'), '');
  return { project, packageRoot };
}

/* --------------------------------------------------------- the command line */

test('started through npx, advice says npx, because the bin npx found is gone afterwards', () => {
  assert.equal(cliCommand({ packageRoot: PACKAGE_ROOT, env: { npm_command: 'exec' } }), `npx ${BIN_NAME}`);
});

test('in a clone, the short form only from the clone itself', () => {
  assert.equal(cliCommand({ packageRoot: PACKAGE_ROOT, from: PACKAGE_ROOT, env: {} }), 'node src/cli.mjs');
  assert.equal(cliCommand({ packageRoot: PACKAGE_ROOT, from: tempDir(), env: {} }), `node ${CLI}`);
});

test('installed with the bin on PATH, advice is the bare command', () => {
  const { packageRoot } = installedPackage();
  const command = cliCommand({ packageRoot, from: tempDir(), env: {}, onPath: () => true });
  assert.equal(command, BIN_NAME);
});

test('installed into a project without the bin on PATH: npx inside the project, the full path outside it', () => {
  const { project, packageRoot } = installedPackage();
  const offPath = () => false;
  assert.equal(cliCommand({ packageRoot, from: project, env: {}, onPath: offPath }), `npx ${BIN_NAME}`);
  assert.equal(
    cliCommand({ packageRoot, from: tempDir(), env: {}, onPath: offPath }),
    `node ${join(packageRoot, 'src', 'cli.mjs')}`,
  );
});

test('the bin on PATH counts only when it runs this CLI', () => {
  const { packageRoot } = installedPackage();
  const cliPath = join(packageRoot, 'src', 'cli.mjs');
  const bin = tempDir();
  symlinkSync(cliPath, join(bin, BIN_NAME));
  assert.equal(binOnPath({ cliPath, env: { PATH: bin }, platform: 'darwin' }), true);

  const elsewhere = tempDir();
  writeFileSync(join(elsewhere, 'other.mjs'), '');
  const otherBin = tempDir();
  symlinkSync(join(elsewhere, 'other.mjs'), join(otherBin, BIN_NAME));
  assert.equal(binOnPath({ cliPath, env: { PATH: otherBin }, platform: 'darwin' }), false);
  assert.equal(binOnPath({ cliPath, env: { PATH: '' }, platform: 'darwin' }), false);
});

test('a folder under home is shown from ~, and one with a space is quoted', () => {
  assert.equal(displayPath('/home/pat/leagues/office', '/home/pat'), join('~', 'leagues', 'office'));
  assert.equal(displayPath('/srv/leagues/office', '/home/pat'), '/srv/leagues/office');
  assert.equal(displayPath('/home/pat/my leagues/office', '/home/pat'), `"${join('~', 'my leagues', 'office')}"`);
});

/* ------------------------------------------------------------------ banner */

test('every line of the banner box is the same width, so its right edge is straight', () => {
  const box = banner({ tagline: 'x' }).split('\n').slice(0, 5);
  assert.equal(new Set(box.map((line) => [...line].length)).size, 1, box.join('\n'));
  assert.match(box[1], /F A N T A S Y {3}P R E S S B O X/);
});

/* ---------------------------------------------------------- weekly routine */

test('the weekly routine runs preview, recap and rankings, and records what was posted', () => {
  const routine = weeklyRoutine('fp', 'dynasty').join('\n');
  for (const command of ['fp preview', 'fp recap', 'fp rankings', 'fp transactions']) {
    assert.ok(routine.includes(command), command);
  }
  assert.match(routine, /fp record <reply file> --task preview/);
  assert.match(routine, /fp record <reply file> --task rankings/);
});

test('a guillotine league is given its own three editions, never the matchup ones', () => {
  const routine = weeklyRoutine('fp', 'guillotine').join('\n');
  assert.match(routine, /fp survival-preview/);
  assert.match(routine, /fp chop-recap/);
  assert.match(routine, /fp record <reply file> --task survival-rankings/);
  assert.doesNotMatch(routine, /fp (preview|recap|rankings)\b/);
});

/* ---------------------------------------------------------------- bare run */

function runBare(cwd) {
  const env = { ...process.env };
  delete env.PRESSBOX_WORKSPACE;
  delete env.npm_command;
  return spawnSync(process.execPath, [CLI], { cwd, env, encoding: 'utf8' });
}

test('run bare outside a league folder, it says how to start, and writes nothing', () => {
  const cwd = tempDir();
  const result = runBare(cwd);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /No league here yet/);
  assert.match(result.stdout, /init --workspace/);
  assert.match(result.stdout, /--help/);
  assert.equal(existsSync(join(cwd, '.env')), false);
});

test('run bare inside a league folder, it gives that league its week', () => {
  const cwd = tempDir();
  writeFileSync(join(cwd, '.env'), 'SLEEPER_LEAGUE_ID=1\nLEAGUE_FORMAT=guillotine\n');
  const result = runBare(cwd);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /League folder:/);
  assert.match(result.stdout, /survival-preview/);
  assert.match(result.stdout, /doctor/);
});

test('--help starts with the steps to a first edition, and the week after that', () => {
  const { stdout } = spawnSync(process.execPath, [CLI, '--help'], { encoding: 'utf8' });
  assert.ok(stdout.indexOf('Getting started') < stdout.indexOf('Commands'));
  assert.match(stdout, /init --workspace ~\/leagues\/my-league/);
  assert.match(stdout, /Every week, from the league folder/);
  assert.match(stdout, /record <reply file> --task rankings/);
});
