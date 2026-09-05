import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Command } from '../dispatch';
import { memoryIo } from '../io';
import { fixtureRepo, tempRoot } from '../testing/harness';
import { runBypass } from './cli';

// src/cli.ts registers this as a CommandTable entry, so the injected-deps
// parameter has to stay optional. Driving one case through this binding pins
// that shape and exercises the default deps the CLI itself runs on.
const asCommand: Command = runBypass;

// Every case points the machine-wide flag at a path that does not exist, so the
// operator's own ~/.claude/engineos.bypass can never decide a test. Mirrors the
// the ENGINEOS_BYPASS_FLAG isolation src/bypass/bypass.e2e.test.ts applies.
const ISOLATED: NodeJS.ProcessEnv = { ENGINEOS_BYPASS_FLAG: '/nonexistent/engineos.bypass' };

const ON_LINE = 'engineos: BYPASSED — routing, agent dispatch, and Stop gates are off for this session\n';
const RESTORED_LINE = 'engineos: active — routing, agent dispatch, and Stop gates restored\n';

interface Run {
  status: number;
  stdout: string;
  stderr: string;
}

function hasGit(): boolean {
  return spawnSync('git', ['--version'], { encoding: 'utf8' }).status === 0;
}

function run(argv: string[], opts: { env?: NodeJS.ProcessEnv; cwd?: string } = {}): Run {
  const io = memoryIo({ env: opts.env ?? ISOLATED, cwd: opts.cwd ?? '/' });
  const status = runBypass(argv, io, { spawn: spawnSync });
  return { status, stdout: io.stdout.join(''), stderr: io.stderr.join('') };
}

function markerOf(repo: string): string {
  return join(repo, '.git', 'ENGINEOS_BYPASS');
}

// src/bypass/bypass.e2e.test.ts (CLI status, no switch) — `status` with no marker and no sticky switch.
test('status answers active when every switch is off', (t) => {
  if (!hasGit()) {
    t.skip('git is not installed');
    return;
  }
  const repo = fixtureRepo(tempRoot(t));
  assert.deepEqual(run(['status', repo]), { status: 0, stdout: 'active\n', stderr: '' });
});

// src/bypass/bypass.e2e.test.ts (CLI on) — `on` sets the marker, and status then names it.
test('on creates the marker in the git dir and says the gates are off', (t) => {
  if (!hasGit()) {
    t.skip('git is not installed');
    return;
  }
  const repo = fixtureRepo(tempRoot(t));
  assert.deepEqual(run(['on', repo]), { status: 0, stdout: ON_LINE, stderr: '' });
  assert.equal(existsSync(markerOf(repo)), true);
  assert.deepEqual(run(['status', repo]), { status: 0, stdout: 'bypassed (repo marker)\n', stderr: '' });
});

// src/bypass/bypass.e2e.test.ts (CLI off) — `off` clears the marker and reports the restore.
test('off removes the marker and says the gates are back', (t) => {
  if (!hasGit()) {
    t.skip('git is not installed');
    return;
  }
  const repo = fixtureRepo(tempRoot(t));
  run(['on', repo]);
  assert.deepEqual(run(['off', repo]), { status: 0, stdout: RESTORED_LINE, stderr: '' });
  assert.equal(existsSync(markerOf(repo)), false);
  assert.deepEqual(run(['status', repo]), { status: 0, stdout: 'active\n', stderr: '' });
});

// src/bypass/bypass.e2e.test.ts (ENGINEOS_BYPASS=1) — the env switch is named, not merely reported as on.
test('status names ENGINEOS_BYPASS=1', (t) => {
  if (!hasGit()) {
    t.skip('git is not installed');
    return;
  }
  const repo = fixtureRepo(tempRoot(t));
  const env: NodeJS.ProcessEnv = { ...ISOLATED, ENGINEOS_BYPASS: '1' };
  assert.deepEqual(run(['status', repo], { env }), { status: 0, stdout: 'bypassed (ENGINEOS_BYPASS=1)\n', stderr: '' });
});

// src/bypass/bypass.e2e.test.ts (machine-wide flag) — the machine-wide flag is named by its path.
test('status names the machine-wide flag by path', (t) => {
  if (!hasGit()) {
    t.skip('git is not installed');
    return;
  }
  const root = tempRoot(t);
  const repo = fixtureRepo(root);
  const flag = join(root, 'machine-flag');
  writeFileSync(flag, '');
  assert.deepEqual(run(['status', repo], { env: { ENGINEOS_BYPASS_FLAG: flag } }), {
    status: 0,
    stdout: `bypassed (${flag})\n`,
    stderr: '',
  });
});

// The precedence bypassActive applies, made visible: the answer names the
// highest switch that is on, so clearing one reveals the next.
test('status reports env over flag over marker', (t) => {
  if (!hasGit()) {
    t.skip('git is not installed');
    return;
  }
  const root = tempRoot(t);
  const repo = fixtureRepo(root);
  const flag = join(root, 'machine-flag');
  writeFileSync(flag, '');
  run(['on', repo]);
  const withFlag: NodeJS.ProcessEnv = { ENGINEOS_BYPASS_FLAG: flag };
  assert.equal(run(['status', repo], { env: { ...withFlag, ENGINEOS_BYPASS: '1' } }).stdout, 'bypassed (ENGINEOS_BYPASS=1)\n');
  assert.equal(run(['status', repo], { env: withFlag }).stdout, `bypassed (${flag})\n`);
  assert.equal(run(['status', repo]).stdout, 'bypassed (repo marker)\n');
});

// src/bypass/bypass.e2e.test.ts (off with a sticky switch) — `off` clears the repo marker, warns that a
// sticky switch still holds, and never clears the sticky switch itself.
test('off warns when ENGINEOS_BYPASS=1 still holds the bypass', (t) => {
  if (!hasGit()) {
    t.skip('git is not installed');
    return;
  }
  const repo = fixtureRepo(tempRoot(t));
  run(['on', repo]);
  const env: NodeJS.ProcessEnv = { ...ISOLATED, ENGINEOS_BYPASS: '1' };
  assert.deepEqual(run(['off', repo], { env }), {
    status: 0,
    stdout: '',
    stderr: 'engineos: repo marker cleared, but ENGINEOS_BYPASS=1 still bypasses everything — unset it to restore\n',
  });
  assert.equal(existsSync(markerOf(repo)), false);
});

test('off warns naming the machine-wide flag and leaves the flag alone', (t) => {
  if (!hasGit()) {
    t.skip('git is not installed');
    return;
  }
  const root = tempRoot(t);
  const repo = fixtureRepo(root);
  const flag = join(root, 'machine-flag');
  writeFileSync(flag, '');
  run(['on', repo]);
  assert.deepEqual(run(['off', repo], { env: { ENGINEOS_BYPASS_FLAG: flag } }), {
    status: 0,
    stdout: '',
    stderr: `engineos: repo marker cleared, but ${flag} still bypasses everything — delete it to restore\n`,
  });
  assert.equal(existsSync(flag), true);
  assert.equal(existsSync(markerOf(repo)), false);
});

// src/bypass/bypass.e2e.test.ts (outside a repo) — outside a repo there is nowhere to put the marker,
// so the command refuses instead of claiming success. Every action refuses:
// `status` would otherwise answer "active" about a switch it cannot set.
test('a directory outside any git repo is refused with 1', (t) => {
  if (!hasGit()) {
    t.skip('git is not installed');
    return;
  }
  const outside = tempRoot(t);
  const expected: Run = {
    status: 1,
    stdout: '',
    stderr: 'engineos: not a git repository — bypass has no effect here\n',
  };
  assert.deepEqual(run(['on', outside]), expected);
  assert.deepEqual(run(['status', outside]), expected);
  assert.deepEqual(run(['off', outside]), expected);
});

test('an unknown action answers 2 with the usage line', (t) => {
  if (!hasGit()) {
    t.skip('git is not installed');
    return;
  }
  const repo = fixtureRepo(tempRoot(t));
  assert.deepEqual(run(['wat', repo]), {
    status: 2,
    stdout: '',
    stderr: 'usage: engineos bypass on|off|status [cwd]\n',
  });
  assert.equal(existsSync(markerOf(repo)), false);
});

// The two defaults bash carried as ${1:-status} and ${2:-$PWD}.
test('no arguments is status for the current directory', (t) => {
  if (!hasGit()) {
    t.skip('git is not installed');
    return;
  }
  const repo = fixtureRepo(tempRoot(t));
  const before = memoryIo({ env: ISOLATED, cwd: repo });
  assert.equal(asCommand([], before), 0);
  assert.equal(before.stdout.join(''), 'active\n');
  run(['on', repo]);
  const after = memoryIo({ env: ISOLATED, cwd: repo });
  assert.equal(asCommand([], after), 0);
  assert.equal(after.stdout.join(''), 'bypassed (repo marker)\n');
});
